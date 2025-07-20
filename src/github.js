import * as core from '@actions/core'
import { getOctokit } from '@actions/github'

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
 * @param {string} token - GitHub token
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Object} options - Filter options
 * @returns {Promise<Array>} Array of Dependabot alerts
 */
export async function getDependabotAlerts(token, owner, repo, options = {}) {
  const { excludeDismissed = true, severityThreshold = 'medium' } = options

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
