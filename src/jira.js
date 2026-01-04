import * as core from '@actions/core'
import axios from 'axios'

/**
 * Sanitize input for use in JQL queries to prevent injection
 * @param {string} input - User input to sanitize
 * @returns {string} Sanitized input safe for JQL
 */
function sanitizeForJQL(input) {
  if (!input || typeof input !== 'string') {
    return ''
  }
  // Remove or escape characters that could be used for JQL injection
  return input.replace(/['"\\]/g, '').trim()
}

/**
 * Validate project key format (alphanumeric + underscore/dash only)
 * @param {string} projectKey - Project key to validate
 * @returns {boolean} True if valid
 */
function validateProjectKey(projectKey) {
  return /^[A-Z0-9_-]+$/i.test(projectKey)
}

/**
 * Create a Jira API client
 * @param {string} jiraUrl - Jira instance URL
 * @param {string} username - Jira username
 * @param {string} apiToken - Jira API token
 * @returns {Object} Axios instance configured for Jira API
 */
export function createJiraClient(jiraUrl, username, apiToken) {
  // Validate inputs
  if (!jiraUrl || !username || !apiToken) {
    throw new Error('Jira URL, username, and API token are required')
  }

  // Validate URL format
  try {
    new URL(jiraUrl)
  } catch {
    throw new Error('Invalid Jira URL format')
  }

  const client = axios.create({
    baseURL: `${jiraUrl}/rest/api/3`,
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
      const status = error.response?.status
      const statusText = error.response?.statusText
      const errorMessages = error.response?.data?.errorMessages?.join(', ')
      const message = error.response?.data?.message
      const errors = error.response?.data?.errors

      let errorDetails = `Status: ${status} ${statusText}`
      if (errorMessages) errorDetails += ` | Error Messages: ${errorMessages}`
      if (message) errorDetails += ` | Message: ${message}`
      if (errors) errorDetails += ` | Errors: ${JSON.stringify(errors)}`
      if (error.response?.data)
        errorDetails += ` | Response: ${JSON.stringify(error.response.data)}`

      core.error(`Jira API Error: ${errorDetails}`)
      throw new Error(`Jira API Error: ${errorDetails}`)
    }
  )

  return client
}

/**
 * Calculate due date based on severity and alert creation date
 * @param {string} severity - Alert severity (critical, high, medium, low)
 * @param {Object} dueDaysConfig - Due days configuration
 * @param {string} createdAt - Alert creation timestamp (ISO string)
 * @returns {string} Due date in YYYY-MM-DD format
 */
export function calculateDueDate(severity, dueDaysConfig, createdAt) {
  const daysMap = {
    critical: dueDaysConfig.critical || 1,
    high: dueDaysConfig.high || 7,
    medium: dueDaysConfig.medium || 30,
    low: dueDaysConfig.low || 90
  }

  const days = daysMap[severity] || daysMap.medium
  const baseDate = createdAt ? new Date(createdAt) : new Date()
  const dueDate = new Date(baseDate)
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
  // Validate inputs
  if (!validateProjectKey(projectKey)) {
    throw new Error(`Invalid project key format: ${projectKey}`)
  }

  const sanitizedProjectKey = sanitizeForJQL(projectKey)
  const sanitizedAlertId = parseInt(alertId, 10)

  if (isNaN(sanitizedAlertId)) {
    throw new Error(`Invalid alert ID: ${alertId}`)
  }

  try {
    const jql = `project = "${sanitizedProjectKey}" AND summary ~ "Dependabot Alert #${sanitizedAlertId}"`

    const response = await jiraClient.get('/search/jql', {
      params: {
        jql,
        fields: 'key,summary,status,updated'
      }
    })

    core.debug(
      `Search JQL: ${jql}, found ${response.data?.issues?.length || 0} issues`
    )
    return response.data?.issues?.length > 0 ? response.data.issues[0] : null
  } catch (error) {
    // Surface API errors so the workflow fails rather than silently skipping
    core.error(`Failed to search for existing issue: ${error.message}`)
    throw error
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

  const dueDate = calculateDueDate(
    alert.severity,
    config.dueDays,
    alert.createdAt
  )

  const description = {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'heading',
        attrs: {
          level: 2
        },
        content: [
          {
            type: 'text',
            text: `Dependabot Security Alert #${alert.id}`
          }
        ]
      },
      {
        type: 'paragraph',
        content: []
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Package: ',
            marks: [{ type: 'strong' }]
          },
          {
            type: 'text',
            text: alert.package
          }
        ]
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Ecosystem: ',
            marks: [{ type: 'strong' }]
          },
          {
            type: 'text',
            text: alert.ecosystem
          }
        ]
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Severity: ',
            marks: [{ type: 'strong' }]
          },
          {
            type: 'text',
            text: alert.severity.toUpperCase()
          }
        ]
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Vulnerable Version Range: ',
            marks: [{ type: 'strong' }]
          },
          {
            type: 'text',
            text: alert.vulnerableVersionRange || 'Not available'
          }
        ]
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'First Patched Version: ',
            marks: [{ type: 'strong' }]
          },
          {
            type: 'text',
            text: alert.firstPatchedVersion || 'Not available'
          }
        ]
      },
      {
        type: 'paragraph',
        content: []
      },
      {
        type: 'heading',
        attrs: {
          level: 3
        },
        content: [
          {
            type: 'text',
            text: 'Description'
          }
        ]
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: alert.description
          }
        ]
      },
      ...(alert.cvss
        ? [
            {
              type: 'paragraph',
              content: []
            },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'CVSS Score: ',
                  marks: [{ type: 'strong' }]
                },
                {
                  type: 'text',
                  text: alert.cvss.toString()
                }
              ]
            }
          ]
        : []),
      ...(alert.cveId
        ? [
            {
              type: 'paragraph',
              content: []
            },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'CVE ID: ',
                  marks: [{ type: 'strong' }]
                },
                {
                  type: 'text',
                  text: alert.cveId
                }
              ]
            }
          ]
        : []),
      ...(alert.ghsaId
        ? [
            {
              type: 'paragraph',
              content: []
            },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'GHSA ID: ',
                  marks: [{ type: 'strong' }]
                },
                {
                  type: 'text',
                  text: alert.ghsaId
                }
              ]
            }
          ]
        : []),
      {
        type: 'paragraph',
        content: []
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'GitHub Alert URL: ',
            marks: [{ type: 'strong' }]
          },
          {
            type: 'text',
            text: alert.url,
            marks: [
              {
                type: 'link',
                attrs: {
                  href: alert.url
                }
              }
            ]
          }
        ]
      },
      {
        type: 'paragraph',
        content: []
      },
      {
        type: 'rule'
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'This issue was automatically created by the Dependabot Jira Sync action.',
            marks: [{ type: 'em' }]
          }
        ]
      }
    ]
  }

  const issueData = {
    fields: {
      project: { key: projectKey },
      summary: `Dependabot Alert #${alert.id}: ${alert.title}`,
      description,
      issuetype: { name: issueType },
      duedate: dueDate
    }
  }

  // Priority is optional - only include if provided (some next-gen projects don't support it)
  if (priority) {
    issueData.fields.priority = { name: priority }
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
    core.debug(
      `Creating Jira issue with payload: ${JSON.stringify(issueData, null, 2)}`
    )
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
  dryRun = false,
  customComment = null
) {
  // If a custom comment is provided, use it (convert plain text to ADF if needed)
  // Otherwise, build the default alert-based comment
  const comment = customComment
    ? {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: customComment
              }
            ]
          }
        ]
      }
    : {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'heading',
            attrs: {
              level: 3
            },
            content: [
              {
                type: 'text',
                text: 'Dependabot Alert Updated'
              }
            ]
          },
          {
            type: 'paragraph',
            content: []
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: `The Dependabot alert #${alert.id} has been updated.`
              }
            ]
          },
          {
            type: 'paragraph',
            content: []
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Current Status: ',
                marks: [{ type: 'strong' }]
              },
              {
                type: 'text',
                text: alert.state
              }
            ]
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Last Updated: ',
                marks: [{ type: 'strong' }]
              },
              {
                type: 'text',
                text: new Date(alert.updatedAt).toLocaleString()
              }
            ]
          },
          ...(alert.dismissedAt
            ? [
                {
                  type: 'paragraph',
                  content: []
                },
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'Dismissed At: ',
                      marks: [{ type: 'strong' }]
                    },
                    {
                      type: 'text',
                      text: new Date(alert.dismissedAt).toLocaleString()
                    }
                  ]
                }
              ]
            : []),
          ...(alert.dismissedReason
            ? [
                {
                  type: 'paragraph',
                  content: []
                },
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'Dismissed Reason: ',
                      marks: [{ type: 'strong' }]
                    },
                    {
                      type: 'text',
                      text: alert.dismissedReason
                    }
                  ]
                }
              ]
            : []),
          ...(alert.dismissedComment
            ? [
                {
                  type: 'paragraph',
                  content: []
                },
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'Dismissed Comment: ',
                      marks: [{ type: 'strong' }]
                    },
                    {
                      type: 'text',
                      text: alert.dismissedComment
                    }
                  ]
                }
              ]
            : []),
          {
            type: 'paragraph',
            content: []
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'GitHub Alert URL: ',
                marks: [{ type: 'strong' }]
              },
              {
                type: 'text',
                text: alert.url,
                marks: [
                  {
                    type: 'link',
                    attrs: {
                      href: alert.url
                    }
                  }
                ]
              }
            ]
          }
        ]
      }

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

/**
 * Find all open Dependabot issues in a Jira project
 * @param {Object} jiraClient - Axios instance for Jira API
 * @param {string} projectKey - Jira project key
 * @returns {Promise<Array>} Array of open Dependabot issues
 */
export async function findOpenDependabotIssues(jiraClient, projectKey) {
  // Validate inputs
  if (!validateProjectKey(projectKey)) {
    throw new Error(`Invalid project key format: ${projectKey}`)
  }

  const sanitizedProjectKey = sanitizeForJQL(projectKey)
  const jql = `project = "${sanitizedProjectKey}" AND labels = "dependabot" AND resolution IS EMPTY`

  core.info(`Searching for open Dependabot issues in project ${projectKey}`)

  try {
    const response = await jiraClient.get('/search/jql', {
      params: {
        jql,
        fields: 'key,summary,description,status',
        maxResults: 100
      }
    })

    const issues = response.data.issues || []
    core.info(`Found ${issues.length} open Dependabot issues`)
    return issues
  } catch (error) {
    // Surface API errors so the workflow fails rather than silently skipping
    core.error(`Failed to search for open Dependabot issues: ${error.message}`)
    throw error
  }
}

/**
 * Extract Dependabot alert ID from Jira issue
 * @param {Object} issue - Jira issue object
 * @returns {string|null} Alert ID or null if not found
 */
export function extractAlertIdFromIssue(issue) {
  // Debug: Log the issue structure
  core.debug(
    `Debug: Issue ${issue.key} structure: ${JSON.stringify(issue, null, 2)}`
  )

  // Jira API often nests fields under 'fields' object
  const summary = issue.summary || issue.fields?.summary
  const description = issue.description || issue.fields?.description

  core.info(`Info: Extracted summary: "${summary}"`)

  // Try to extract from summary first: "Dependabot Alert #123: ..."
  const summaryMatch = summary?.match(/Dependabot Alert #(\d+)/)
  if (summaryMatch) {
    core.info(`Info: Successfully extracted alert ID: ${summaryMatch[1]}`)
    return summaryMatch[1]
  }

  // Try to extract from description: "Alert ID: 123"
  const descriptionMatch = description?.match(/Alert ID:\s*(\d+)/)
  if (descriptionMatch) {
    return descriptionMatch[1]
  }

  core.warning(`Could not extract alert ID from issue ${issue.key}`)
  return null
}

/**
 * Close a Jira issue with a transition
 * @param {Object} jiraClient - Axios instance for Jira API
 * @param {string} issueKey - Jira issue key
 * @param {string} transition - Transition name (e.g., "Done")
 * @param {string} comment - Comment to add when closing
 * @param {boolean} dryRun - Whether this is a dry run
 * @returns {Promise<Object>} Result of the operation
 */
export async function closeJiraIssue(
  jiraClient,
  issueKey,
  transition,
  comment,
  dryRun = false
) {
  if (dryRun) {
    core.info(
      `[DRY RUN] Would close Jira issue ${issueKey} with transition "${transition}"`
    )
    return { closed: false, dryRun: true }
  }

  try {
    // First, get available transitions for the issue
    const transitionsResponse = await jiraClient.get(
      `/issue/${issueKey}/transitions`
    )
    const availableTransitions = transitionsResponse.data.transitions || []

    // Find the transition by name (case-insensitive)
    const targetTransition = availableTransitions.find(
      (t) => t.name.toLowerCase() === transition.toLowerCase()
    )

    if (!targetTransition) {
      const availableNames = availableTransitions.map((t) => t.name).join(', ')
      throw new Error(
        `Transition "${transition}" not available. Available transitions: ${availableNames}`
      )
    }

    // Add comment first
    if (comment) {
      await jiraClient.post(`/issue/${issueKey}/comment`, {
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: comment
                }
              ]
            }
          ]
        }
      })
    }

    // Perform the transition
    await jiraClient.post(`/issue/${issueKey}/transitions`, {
      transition: {
        id: targetTransition.id
      }
    })

    core.info(`Closed Jira issue: ${issueKey} using transition "${transition}"`)
    return { closed: true }
  } catch (error) {
    core.error(`Failed to close Jira issue ${issueKey}: ${error.message}`)
    throw error
  }
}
