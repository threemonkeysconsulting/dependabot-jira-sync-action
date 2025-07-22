/**
 * Unit tests for GitHub API functions
 */
import { jest } from '@jest/globals'

// Mock @actions/core
const mockCore = {
  info: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn(),
  getInput: jest.fn()
}

// Mock @actions/github
const mockOctokit = {
  rest: {
    dependabot: {
      listAlertsForRepo: jest.fn(),
      getAlert: jest.fn()
    }
  }
}

const mockGetOctokit = jest.fn(() => mockOctokit)

// Setup mocks before importing
jest.unstable_mockModule('@actions/core', () => mockCore)
jest.unstable_mockModule('@actions/github', () => ({
  getOctokit: mockGetOctokit
}))
jest.unstable_mockModule('jsonwebtoken', () => ({
  default: {
    sign: jest.fn(() => 'mock-jwt-token')
  }
}))

// Import the functions we want to test
const { getRepoInfo, getDependabotAlerts, parseAlert, getAlertStatus } =
  await import('../src/github.js')

describe('GitHub API Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    delete process.env.GITHUB_REPOSITORY
  })

  describe('getRepoInfo', () => {
    it('should parse repository from environment variable', () => {
      process.env.GITHUB_REPOSITORY = 'octocat/hello-world'

      const result = getRepoInfo()

      expect(result).toEqual({
        owner: 'octocat',
        repo: 'hello-world'
      })
    })

    it('should throw error if GITHUB_REPOSITORY is not set', () => {
      delete process.env.GITHUB_REPOSITORY

      expect(() => getRepoInfo()).toThrow(
        'GITHUB_REPOSITORY environment variable is not set'
      )
    })
  })

  describe('getDependabotAlerts', () => {
    const mockAlertsOpen = [
      {
        number: 1,
        security_advisory: { severity: 'high' },
        state: 'open'
      },
      {
        number: 2,
        security_advisory: { severity: 'low' },
        state: 'open'
      }
    ]

    const mockAlertsAll = [
      ...mockAlertsOpen,
      {
        number: 3,
        security_advisory: { severity: 'critical' },
        state: 'dismissed'
      }
    ]

    beforeEach(() => {
      // Default to open alerts
      mockOctokit.rest.dependabot.listAlertsForRepo.mockResolvedValue({
        data: mockAlertsOpen
      })

      // Mock token authentication (default)
      mockCore.getInput.mockImplementation((name) => {
        if (name === 'github-token') return 'mock-token'
        return ''
      })
    })

    it('should fetch alerts and filter by severity threshold', async () => {
      const result = await getDependabotAlerts('owner', 'repo', {
        severityThreshold: 'medium',
        excludeDismissed: true
      })

      expect(mockGetOctokit).toHaveBeenCalledWith('mock-token')
      expect(
        mockOctokit.rest.dependabot.listAlertsForRepo
      ).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        state: 'open',
        per_page: 100
      })

      // Should only return high severity alert (medium+ threshold, open state)
      // Critical alert is dismissed, so excluded
      expect(result).toHaveLength(1)
      expect(result[0].number).toBe(1)
    })

    it('should include dismissed alerts when excludeDismissed is false', async () => {
      // Mock the API to return all alerts when state: 'all'
      mockOctokit.rest.dependabot.listAlertsForRepo.mockResolvedValueOnce({
        data: mockAlertsAll
      })

      const result = await getDependabotAlerts('owner', 'repo', {
        excludeDismissed: false,
        severityThreshold: 'low'
      })

      expect(
        mockOctokit.rest.dependabot.listAlertsForRepo
      ).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        state: 'all',
        per_page: 100
      })

      // Should return all 3 alerts
      expect(result).toHaveLength(3)
    })

    it('should handle invalid severity threshold', async () => {
      await expect(
        getDependabotAlerts('owner', 'repo', {
          severityThreshold: 'invalid'
        })
      ).rejects.toThrow('Invalid severity threshold: invalid')
    })

    it('should handle GitHub API errors', async () => {
      const apiError = new Error('API rate limit exceeded')
      mockOctokit.rest.dependabot.listAlertsForRepo.mockRejectedValue(apiError)

      await expect(getDependabotAlerts('owner', 'repo')).rejects.toThrow(
        'API rate limit exceeded'
      )

      expect(mockCore.error).toHaveBeenCalledWith(
        'Failed to fetch Dependabot alerts: API rate limit exceeded'
      )
    })
  })

  describe('parseAlert', () => {
    it('should parse a complete Dependabot alert', () => {
      const alert = {
        number: 42,
        security_advisory: {
          summary: 'Critical vulnerability in lodash',
          description: 'Prototype pollution vulnerability',
          severity: 'critical',
          cvss: { score: 9.8 },
          cve_id: 'CVE-2019-10744',
          ghsa_id: 'GHSA-jf85-cpcp-j695'
        },
        security_vulnerability: {
          vulnerable_version_range: '< 4.17.12',
          first_patched_version: { identifier: '4.17.12' }
        },
        dependency: {
          package: {
            name: 'lodash',
            ecosystem: 'npm'
          }
        },
        html_url: 'https://github.com/company/repo/security/dependabot/42',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
        state: 'open',
        dismissed_at: null,
        dismissed_reason: null,
        dismissed_comment: null
      }

      const result = parseAlert(alert)

      expect(result).toEqual({
        id: 42,
        title: 'Critical vulnerability in lodash',
        description: 'Prototype pollution vulnerability',
        severity: 'critical',
        package: 'lodash',
        ecosystem: 'npm',
        vulnerableVersionRange: '< 4.17.12',
        firstPatchedVersion: '4.17.12',
        cvss: 9.8,
        cveId: 'CVE-2019-10744',
        ghsaId: 'GHSA-jf85-cpcp-j695',
        url: 'https://github.com/company/repo/security/dependabot/42',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-02T00:00:00Z',
        state: 'open',
        dismissedAt: null,
        dismissedReason: null,
        dismissedComment: null
      })
    })

    it('should handle incomplete alert data with defaults', () => {
      const incompleteAlert = {
        number: 1,
        html_url: 'https://github.com/test/alert/1',
        state: 'open'
      }

      const result = parseAlert(incompleteAlert)

      expect(result).toEqual({
        id: 1,
        title: 'Vulnerability in unknown',
        description: 'No description available',
        severity: 'unknown',
        package: 'unknown',
        ecosystem: 'unknown',
        vulnerableVersionRange: 'unknown',
        firstPatchedVersion: 'Not available',
        cvss: null,
        cveId: null,
        ghsaId: null,
        url: 'https://github.com/test/alert/1',
        createdAt: undefined,
        updatedAt: undefined,
        state: 'open',
        dismissedAt: undefined,
        dismissedReason: undefined,
        dismissedComment: undefined
      })
    })

    it('should handle dismissed alert', () => {
      const dismissedAlert = {
        number: 5,
        security_advisory: {
          summary: 'Low severity issue',
          severity: 'low'
        },
        dependency: {
          package: { name: 'test-package' }
        },
        html_url: 'https://github.com/test/alert/5',
        state: 'dismissed',
        dismissed_at: '2023-01-05T00:00:00Z',
        dismissed_reason: 'tolerable_risk',
        dismissed_comment: 'Risk accepted by security team'
      }

      const result = parseAlert(dismissedAlert)

      expect(result.state).toBe('dismissed')
      expect(result.dismissedAt).toBe('2023-01-05T00:00:00Z')
      expect(result.dismissedReason).toBe('tolerable_risk')
      expect(result.dismissedComment).toBe('Risk accepted by security team')
    })
  })

  describe('getAlertStatus', () => {
    beforeEach(() => {
      // Mock successful token authentication
      mockCore.getInput.mockImplementation((name) => {
        if (name === 'github-token') return 'mock-token'
        return ''
      })
    })

    it('should return "open" for open alerts', async () => {
      const mockAlert = {
        data: {
          number: 42,
          state: 'open'
        }
      }

      mockOctokit.rest.dependabot.getAlert.mockResolvedValue(mockAlert)

      const result = await getAlertStatus('owner', 'repo', '42')

      expect(mockOctokit.rest.dependabot.getAlert).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        alert_number: 42
      })

      expect(result).toBe('open')
      expect(mockCore.info).toHaveBeenCalledWith('Checking status of alert #42')
    })

    it('should return "dismissed" for dismissed alerts', async () => {
      const mockAlert = {
        data: {
          number: 42,
          state: 'dismissed'
        }
      }

      mockOctokit.rest.dependabot.getAlert.mockResolvedValue(mockAlert)

      const result = await getAlertStatus('owner', 'repo', '42')

      expect(result).toBe('dismissed')
    })

    it('should return "fixed" for fixed alerts', async () => {
      const mockAlert = {
        data: {
          number: 42,
          state: 'fixed'
        }
      }

      mockOctokit.rest.dependabot.getAlert.mockResolvedValue(mockAlert)

      const result = await getAlertStatus('owner', 'repo', '42')

      expect(result).toBe('fixed')
    })

    it('should return original state for unknown states', async () => {
      const mockAlert = {
        data: {
          number: 42,
          state: 'unknown_state'
        }
      }

      mockOctokit.rest.dependabot.getAlert.mockResolvedValue(mockAlert)

      const result = await getAlertStatus('owner', 'repo', '42')

      expect(result).toBe('unknown_state')
    })

    it('should return "not_found" for 404 errors', async () => {
      const notFoundError = new Error('Not Found')
      notFoundError.status = 404
      mockOctokit.rest.dependabot.getAlert.mockRejectedValue(notFoundError)

      const result = await getAlertStatus('owner', 'repo', '999')

      expect(result).toBe('not_found')
      expect(mockCore.info).toHaveBeenCalledWith(
        'Alert #999 not found (may have been deleted)'
      )
    })

    it('should return "unknown" for other API errors', async () => {
      const apiError = new Error('API rate limit exceeded')
      mockOctokit.rest.dependabot.getAlert.mockRejectedValue(apiError)

      const result = await getAlertStatus('owner', 'repo', '42')

      expect(result).toBe('unknown')
      expect(mockCore.warning).toHaveBeenCalledWith(
        'Failed to check status of alert #42: API rate limit exceeded'
      )
    })

    it('should handle string alert IDs', async () => {
      const mockAlert = {
        data: {
          number: 42,
          state: 'open'
        }
      }

      mockOctokit.rest.dependabot.getAlert.mockResolvedValue(mockAlert)

      await getAlertStatus('owner', 'repo', '42') // String ID

      expect(mockOctokit.rest.dependabot.getAlert).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        alert_number: 42 // Should be converted to number
      })
    })
  })
})
