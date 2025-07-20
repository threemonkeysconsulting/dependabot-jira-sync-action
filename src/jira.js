import * as core from '@actions/core'
import axios from 'axios'

/**
 * Create a Jira API client
 * @param {string} jiraUrl - Jira instance URL
 * @param {string} username - Jira username
 * @param {string} apiToken - Jira API token
 * @returns {Object} Axios instance configured for Jira API
 */
export function createJiraClient(jiraUrl, username, apiToken) {
  const client = axios.create({
    baseURL: `${jiraUrl}/rest/api/2`,
    auth: {
      username,
      password: apiToken
    },
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    }
  })

  // Add response interceptor for error handling
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      const message =
        error.response?.data?.errorMessages?.join(', ') ||
        error.response?.data?.message ||
        error.message
      core.error(`Jira API Error: ${message}`)
      throw new Error(`Jira API Error: ${message}`)
    }
  )

  return client
}

/**
 * Calculate due date based on severity and configuration
 * @param {string} severity - Alert severity (critical, high, medium, low)
 * @param {Object} dueDaysConfig - Due days configuration
 * @returns {string} Due date in YYYY-MM-DD format
 */
export function calculateDueDate(severity, dueDaysConfig) {
  const daysMap = {
    critical: dueDaysConfig.critical || 1,
    high: dueDaysConfig.high || 7,
    medium: dueDaysConfig.medium || 30,
    low: dueDaysConfig.low || 90
  }

  const days = daysMap[severity] || daysMap.medium
  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + days)

  return dueDate.toISOString().split('T')[0] // Return YYYY-MM-DD format
}

/**
 * Check if a Jira issue already exists for a Dependabot alert
 * @param {Object} jiraClient - Jira API client
 * @param {string} projectKey - Jira project key
 * @param {number} alertId - Dependabot alert ID
 * @returns {Promise<Object|null>} Existing issue or null
 */
export async function findExistingIssue(jiraClient, projectKey, alertId) {
  try {
    const jql = `project = ${projectKey} AND summary ~ "Dependabot Alert #${alertId}"`

    const response = await jiraClient.get('/search', {
      params: {
        jql,
        fields: 'key,summary,status,updated'
      }
    })

    return response.data.issues.length > 0 ? response.data.issues[0] : null
  } catch (error) {
    core.warning(`Failed to search for existing issue: ${error.message}`)
    return null
  }
}

/**
 * Create a new Jira issue for a Dependabot alert
 * @param {Object} jiraClient - Jira API client
 * @param {Object} config - Jira configuration
 * @param {Object} alert - Parsed Dependabot alert
 * @param {boolean} dryRun - Whether this is a dry run
 * @returns {Promise<Object>} Created issue data
 */
export async function createJiraIssue(
  jiraClient,
  config,
  alert,
  dryRun = false
) {
  const { projectKey, issueType, priority, labels, assignee } = config

  const dueDate = calculateDueDate(alert.severity, config.dueDays)

  const description = `
*Dependabot Security Alert #${alert.id}*

*Package:* ${alert.package}
*Ecosystem:* ${alert.ecosystem}
*Severity:* ${alert.severity.toUpperCase()}
*Vulnerable Version Range:* ${alert.vulnerableVersionRange}
*First Patched Version:* ${alert.firstPatchedVersion}

*Description:*
${alert.description}

${alert.cvss ? `*CVSS Score:* ${alert.cvss}` : ''}
${alert.cveId ? `*CVE ID:* ${alert.cveId}` : ''}
${alert.ghsaId ? `*GHSA ID:* ${alert.ghsaId}` : ''}

*GitHub Alert URL:* ${alert.url}

---
_This issue was automatically created by the Dependabot Jira Sync action._
  `.trim()

  const issueData = {
    fields: {
      project: { key: projectKey },
      summary: `Dependabot Alert #${alert.id}: ${alert.title}`,
      description,
      issuetype: { name: issueType },
      priority: { name: priority },
      duedate: dueDate
    }
  }

  // Add labels if provided
  if (labels && labels.length > 0) {
    issueData.fields.labels = labels.split(',').map((label) => label.trim())
  }

  // Add assignee if provided
  if (assignee) {
    issueData.fields.assignee = { name: assignee }
  }

  if (dryRun) {
    core.info(`[DRY RUN] Would create Jira issue: ${issueData.fields.summary}`)
    return { key: 'DRY-RUN-KEY', dryRun: true }
  }

  try {
    const response = await jiraClient.post('/issue', issueData)
    core.info(`Created Jira issue: ${response.data.key}`)
    return response.data
  } catch (error) {
    core.error(`Failed to create Jira issue: ${error.message}`)
    throw error
  }
}

/**
 * Update an existing Jira issue for a Dependabot alert
 * @param {Object} jiraClient - Jira API client
 * @param {string} issueKey - Jira issue key
 * @param {Object} alert - Parsed Dependabot alert
 * @param {boolean} dryRun - Whether this is a dry run
 * @returns {Promise<Object>} Update result
 */
export async function updateJiraIssue(
  jiraClient,
  issueKey,
  alert,
  dryRun = false
) {
  const comment = `
*Dependabot Alert Updated*

The Dependabot alert #${alert.id} has been updated.

*Current Status:* ${alert.state}
*Last Updated:* ${new Date(alert.updatedAt).toLocaleString()}

${alert.dismissedAt ? `*Dismissed At:* ${new Date(alert.dismissedAt).toLocaleString()}` : ''}
${alert.dismissedReason ? `*Dismissed Reason:* ${alert.dismissedReason}` : ''}
${alert.dismissedComment ? `*Dismissed Comment:* ${alert.dismissedComment}` : ''}

*GitHub Alert URL:* ${alert.url}
  `.trim()

  if (dryRun) {
    core.info(`[DRY RUN] Would update Jira issue ${issueKey} with comment`)
    return { updated: true, dryRun: true }
  }

  try {
    await jiraClient.post(`/issue/${issueKey}/comment`, {
      body: comment
    })

    core.info(`Updated Jira issue: ${issueKey}`)
    return { updated: true }
  } catch (error) {
    core.error(`Failed to update Jira issue ${issueKey}: ${error.message}`)
    throw error
  }
}
