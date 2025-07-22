import * as core from '@actions/core'
import { getOctokit } from '@actions/github'
import jwt from 'jsonwebtoken'

/**
 * Generate JWT token for GitHub App authentication
 * @param {string} appId - GitHub App ID
 * @param {string} privateKey - GitHub App private key
 * @returns {string} JWT token
 */
function generateJWT(appId, privateKey) {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iat: now - 60, // Issued 1 minute ago
    exp: now + 600, // Expires in 10 minutes
    iss: appId
  }

  // Handle both PEM format and base64 encoded keys
  let formattedKey = privateKey
  if (!privateKey.includes('BEGIN')) {
    // If it's base64 encoded, decode it
    formattedKey = Buffer.from(privateKey, 'base64').toString('utf8')
  }

  return jwt.sign(payload, formattedKey, { algorithm: 'RS256' })
}

/**
 * Get installation access token for GitHub App
 * @param {string} appId - GitHub App ID
 * @param {string} privateKey - GitHub App private key
 * @param {string} installationId - Installation ID
 * @returns {Promise<string>} Installation access token
 */
async function getInstallationToken(appId, privateKey, installationId) {
  const jwtToken = generateJWT(appId, privateKey)
  const octokit = getOctokit(jwtToken)

  core.info(
    `Getting installation token for App ID: ${appId}, Installation: ${installationId}`
  )

  try {
    const response = await octokit.rest.apps.createInstallationAccessToken({
      installation_id: parseInt(installationId, 10)
    })

    return response.data.token
  } catch (error) {
    throw new Error(`Failed to get installation token: ${error.message}`)
  }
}

/**
 * Determine authentication method and get appropriate token
 * @returns {Promise<string>} GitHub access token
 */
export async function getGitHubToken() {
  const appId = core.getInput('github-app-id')
  const privateKey = core.getInput('github-app-private-key')
  const installationId = core.getInput('github-app-installation-id')
  const token = core.getInput('github-token')

  // Check if GitHub App credentials are provided
  if (appId && privateKey && installationId) {
    core.info('🔑 Using GitHub App authentication')
    return await getInstallationToken(appId, privateKey, installationId)
  }

  // Fall back to PAT/GITHUB_TOKEN
  if (token) {
    core.info('🔑 Using GitHub token authentication')
    return token
  }

  throw new Error(
    'No authentication method provided. Please provide either:\n' +
      '1. GitHub App credentials (github-app-id, github-app-private-key, github-app-installation-id), or\n' +
      '2. GitHub token (github-token)'
  )
}

/**
 * Get GitHub repository information from the context
 * @returns {Object} Repository owner and name
 */
export function getRepoInfo() {
  const repository = process.env.GITHUB_REPOSITORY
  if (!repository) {
    throw new Error('GITHUB_REPOSITORY environment variable is not set')
  }

  const [owner, repo] = repository.split('/')
  return { owner, repo }
}

/**
 * Fetch Dependabot alerts from GitHub
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Object} options - Filter options
 * @returns {Promise<Array>} Array of Dependabot alerts
 */
export async function getDependabotAlerts(owner, repo, options = {}) {
  const { excludeDismissed = true, severityThreshold = 'medium' } = options

  const token = await getGitHubToken()
  const octokit = getOctokit(token)

  core.info(`Fetching Dependabot alerts for ${owner}/${repo}`)

  try {
    // Get Dependabot alerts using the REST API
    const response = await octokit.rest.dependabot.listAlertsForRepo({
      owner,
      repo,
      state: excludeDismissed ? 'open' : 'all',
      per_page: 100
    })

    const alerts = response.data
    core.info(`Found ${alerts.length} total alerts`)

    // Filter by severity threshold
    const severityLevels = ['low', 'medium', 'high', 'critical']
    const minSeverityIndex = severityLevels.indexOf(
      severityThreshold.toLowerCase()
    )

    if (minSeverityIndex === -1) {
      throw new Error(`Invalid severity threshold: ${severityThreshold}`)
    }

    const filteredAlerts = alerts.filter((alert) => {
      const alertSeverity = alert.security_advisory?.severity?.toLowerCase()
      const alertSeverityIndex = severityLevels.indexOf(alertSeverity)
      return alertSeverityIndex >= minSeverityIndex
    })

    core.info(
      `${filteredAlerts.length} alerts match severity threshold: ${severityThreshold}`
    )

    return filteredAlerts
  } catch (error) {
    core.error(`Failed to fetch Dependabot alerts: ${error.message}`)
    throw error
  }
}

/**
 * Extract relevant information from a Dependabot alert for Jira
 * @param {Object} alert - Dependabot alert object
 * @returns {Object} Structured alert data for Jira
 */
export function parseAlert(alert) {
  const advisory = alert.security_advisory || {}
  const vulnerability = alert.security_vulnerability || {}
  const dependency = alert.dependency || {}

  return {
    id: alert.number,
    title:
      advisory.summary ||
      `Vulnerability in ${dependency.package?.name || 'unknown'}`,
    description: advisory.description || 'No description available',
    severity: advisory.severity?.toLowerCase() || 'unknown',
    package: dependency.package?.name || 'unknown',
    ecosystem: dependency.package?.ecosystem || 'unknown',
    vulnerableVersionRange: vulnerability.vulnerable_version_range || 'unknown',
    firstPatchedVersion:
      vulnerability.first_patched_version?.identifier || 'Not available',
    cvss: advisory.cvss?.score || null,
    cveId: advisory.cve_id || null,
    ghsaId: advisory.ghsa_id || null,
    url: alert.html_url,
    createdAt: alert.created_at,
    updatedAt: alert.updated_at,
    state: alert.state,
    dismissedAt: alert.dismissed_at,
    dismissedReason: alert.dismissed_reason,
    dismissedComment: alert.dismissed_comment
  }
}

/**
 * Get the status of a specific Dependabot alert
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} alertId - Alert ID to check
 * @returns {Promise<string>} Alert status: 'open', 'fixed', 'dismissed', or 'not_found'
 */
export async function getAlertStatus(owner, repo, alertId) {
  const token = await getGitHubToken()
  const octokit = getOctokit(token)

  try {
    core.info(`Checking status of alert #${alertId}`)

    const response = await octokit.rest.dependabot.getAlert({
      owner,
      repo,
      alert_number: parseInt(alertId, 10)
    })

    const alert = response.data

    // Map GitHub states to our simplified states
    if (alert.state === 'open') {
      return 'open'
    } else if (alert.state === 'dismissed') {
      return 'dismissed'
    } else if (alert.state === 'fixed') {
      return 'fixed'
    } else {
      return alert.state // Return whatever GitHub says
    }
  } catch (error) {
    if (error.status === 404) {
      core.info(`Alert #${alertId} not found (may have been deleted)`)
      return 'not_found'
    }

    core.warning(
      `Failed to check status of alert #${alertId}: ${error.message}`
    )
    return 'unknown'
  }
}
