/**
 * Minimal live integration tests against Jira Cloud.
 *
 * These tests:
 * - Create a Jira client with real credentials
 * - Create an issue using the action's payload shape
 * - Search for the issue
 * - Add a comment
 * - Transition/close the issue
 *
 * They are skipped unless the required environment variables are present:
 *   JIRA_URL, JIRA_USERNAME, JIRA_API_TOKEN, JIRA_PROJECT_KEY
 * Optional overrides (defaults match action defaults):
 *   JIRA_ISSUE_TYPE (default: Bug)
 *   JIRA_PRIORITY (default: Medium)
 *   JIRA_CLOSE_TRANSITION (default: Done)
 *   JIRA_ASSIGNEE (optional)
 */
import { jest } from '@jest/globals'
import {
  createJiraClient,
  findExistingIssue,
  createJiraIssue,
  updateJiraIssue,
  closeJiraIssue
} from '../src/jira.js'

const requiredEnv = [
  'JIRA_URL',
  'JIRA_USERNAME',
  'JIRA_API_TOKEN',
  'JIRA_PROJECT_KEY'
]
const hasAllEnv = requiredEnv.every(
  (key) => process.env[key] && process.env[key].trim() !== ''
)

const maybeDescribe = hasAllEnv ? describe : describe.skip

maybeDescribe('Jira integration (live)', () => {
  jest.setTimeout(30000)

  const jiraUrl = process.env.JIRA_URL
  const jiraUsername = process.env.JIRA_USERNAME
  const jiraApiToken = process.env.JIRA_API_TOKEN
  const projectKey = process.env.JIRA_PROJECT_KEY
  const issueType = process.env.JIRA_ISSUE_TYPE || 'Bug'
  // Priority is optional - next-gen projects may not support it
  // If JIRA_PRIORITY is explicitly set to empty string, use null; otherwise default to 'Medium' if not set
  const priority =
    process.env.JIRA_PRIORITY === ''
      ? null
      : process.env.JIRA_PRIORITY || 'Medium'
  const closeTransition = process.env.JIRA_CLOSE_TRANSITION || 'Done'
  const assignee = process.env.JIRA_ASSIGNEE || null

  const jiraConfig = {
    projectKey,
    issueType,
    priority, // Will be null if explicitly set to empty, which will be omitted in createJiraIssue
    labels: 'dependabot,security',
    assignee,
    dueDays: { critical: 1, high: 7, medium: 30, low: 90 }
  }

  const alertId = Date.now() % 100000 // keep it reasonably small for summary
  const alert = {
    id: alertId,
    title: `Integration test alert #${alertId}`,
    description: 'Integration test issue created by automated test.',
    severity: 'high',
    package: 'integration-test-pkg',
    ecosystem: 'npm',
    url: 'https://example.com',
    createdAt: new Date().toISOString()
  }

  let jiraClient
  let createdIssueKey

  beforeAll(() => {
    jiraClient = createJiraClient(jiraUrl, jiraUsername, jiraApiToken)
  })

  it('creates a Jira issue using the action payload', async () => {
    const result = await createJiraIssue(jiraClient, jiraConfig, alert, false)
    createdIssueKey = result.key
    expect(createdIssueKey).toBeDefined()
  })

  it('finds the created issue via search', async () => {
    // Wait for Jira to index the newly created issue (can take a few seconds)
    // Retry up to 5 times with 2 second delays
    let issue = null
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      issue = await findExistingIssue(jiraClient, projectKey, alert.id)
      if (issue) break
    }
    expect(issue).toBeDefined()
    expect(issue?.key).toBe(createdIssueKey)
  })

  it('adds a comment to the issue', async () => {
    const comment = `Automated integration test comment for ${createdIssueKey}`
    const result = await updateJiraIssue(
      jiraClient,
      createdIssueKey,
      alert,
      false,
      comment
    )
    expect(result.updated).toBe(true)
  })

  it('transitions the issue to done/closed', async () => {
    const result = await closeJiraIssue(
      jiraClient,
      createdIssueKey,
      closeTransition,
      'Closed by integration test',
      false
    )
    expect(result.closed).toBe(true)
  })
})
