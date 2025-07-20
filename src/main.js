import * as core from '@actions/core'
import { getRepoInfo, getDependabotAlerts, parseAlert } from './github.js'
import {
  createJiraClient,
  findExistingIssue,
  createJiraIssue,
  updateJiraIssue
} from './jira.js'

/**
 * Get input configuration from action inputs
 * @returns {Object} Configuration object
 */
function getConfig() {
  const jiraUrl = core.getInput('jira-url', { required: true })
  const jiraUsername = core.getInput('jira-username', { required: true })
  const jiraApiToken = core.getInput('jira-api-token', { required: true })
  const jiraProjectKey = core.getInput('jira-project-key', { required: true })

  return {
    jira: {
      url: jiraUrl,
      username: jiraUsername,
      apiToken: jiraApiToken,
      projectKey: jiraProjectKey,
      issueType: core.getInput('jira-issue-type') || 'Bug',
      priority: core.getInput('jira-priority') || 'Medium',
      labels: core.getInput('jira-labels') || 'dependabot,security',
      assignee: core.getInput('jira-assignee') || null,
      dueDays: {
        critical: parseInt(core.getInput('critical-due-days') || '7', 10),
        high: parseInt(core.getInput('high-due-days') || '14', 10),
        medium: parseInt(core.getInput('medium-due-days') || '60', 10),
        low: parseInt(core.getInput('low-due-days') || '90', 10)
      }
    },
    filters: {
      severityThreshold: core.getInput('severity-threshold') || 'medium',
      excludeDismissed: core.getBooleanInput('exclude-dismissed') !== false
    },
    behavior: {
      updateExisting: core.getBooleanInput('update-existing') !== false,
      dryRun: core.getBooleanInput('dry-run') === true
    }
  }
}

/**
 * The main function for the action.
 *
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run() {
  try {
    const config = getConfig()

    core.info('Starting Dependabot Jira Sync...')

    if (config.behavior.dryRun) {
      core.warning('🧪 DRY RUN MODE - No changes will be made')
    }

    // Get repository information
    const { owner, repo } = getRepoInfo()
    core.info(`Repository: ${owner}/${repo}`)

    // Fetch Dependabot alerts
    const alerts = await getDependabotAlerts(owner, repo, {
      excludeDismissed: config.filters.excludeDismissed,
      severityThreshold: config.filters.severityThreshold
    })

    if (alerts.length === 0) {
      core.info('✅ No Dependabot alerts found matching the criteria')
      core.setOutput('issues-created', '0')
      core.setOutput('issues-updated', '0')
      core.setOutput('alerts-processed', '0')
      core.setOutput('summary', 'No alerts to process')
      return
    }

    // Create Jira client
    const jiraClient = createJiraClient(
      config.jira.url,
      config.jira.username,
      config.jira.apiToken
    )

    let issuesCreated = 0
    let issuesUpdated = 0
    const processedAlerts = []

    // Process each alert
    for (const alert of alerts) {
      try {
        const parsedAlert = parseAlert(alert)
        processedAlerts.push(parsedAlert)

        core.info(`Processing alert #${parsedAlert.id}: ${parsedAlert.title}`)

        // Check if issue already exists
        const existingIssue = await findExistingIssue(
          jiraClient,
          config.jira.projectKey,
          parsedAlert.id
        )

        if (existingIssue) {
          if (config.behavior.updateExisting) {
            core.info(`Found existing issue: ${existingIssue.key}`)
            await updateJiraIssue(
              jiraClient,
              existingIssue.key,
              parsedAlert,
              config.behavior.dryRun
            )
            issuesUpdated++
          } else {
            core.info(
              `Skipping existing issue: ${existingIssue.key} (update-existing is false)`
            )
          }
        } else {
          // Create new issue
          const newIssue = await createJiraIssue(
            jiraClient,
            config.jira,
            parsedAlert,
            config.behavior.dryRun
          )
          issuesCreated++

          if (!config.behavior.dryRun) {
            core.info(
              `✅ Created Jira issue ${newIssue.key} for alert #${parsedAlert.id}`
            )
          }
        }
      } catch (error) {
        core.error(`Failed to process alert #${alert.number}: ${error.message}`)
        // Continue processing other alerts
      }
    }

    // Generate summary
    const summary = config.behavior.dryRun
      ? `DRY RUN: Would create ${issuesCreated} issues and update ${issuesUpdated} issues`
      : `Created ${issuesCreated} new issues and updated ${issuesUpdated} existing issues`

    core.info(`\n📊 Summary:`)
    core.info(`- Alerts processed: ${processedAlerts.length}`)
    core.info(`- Issues created: ${issuesCreated}`)
    core.info(`- Issues updated: ${issuesUpdated}`)

    if (config.behavior.dryRun) {
      core.info(`- Mode: DRY RUN (no actual changes made)`)
    }

    // Set outputs
    core.setOutput('issues-created', issuesCreated.toString())
    core.setOutput('issues-updated', issuesUpdated.toString())
    core.setOutput('alerts-processed', processedAlerts.length.toString())
    core.setOutput('summary', summary)

    core.info('✅ Dependabot Jira Sync completed successfully')
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) {
      core.setFailed(error.message)
    } else {
      core.setFailed('An unknown error occurred')
    }
  }
}
