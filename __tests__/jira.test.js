/**
 * Unit tests for Jira API functions
 */
import { jest } from '@jest/globals'

// Mock @actions/core
const mockCore = {
  info: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn()
}

// Mock axios
const mockAxiosInstance = {
  get: jest.fn(),
  post: jest.fn(),
  interceptors: {
    response: {
      use: jest.fn()
    }
  }
}

const mockAxios = {
  create: jest.fn(() => mockAxiosInstance)
}

// Setup mocks before importing
jest.unstable_mockModule('@actions/core', () => mockCore)
jest.unstable_mockModule('axios', () => ({ default: mockAxios }))

// Import the functions we want to test
const {
  createJiraClient,
  calculateDueDate,
  findExistingIssue,
  createJiraIssue,
  updateJiraIssue,
  findOpenDependabotIssues,
  extractAlertIdFromIssue,
  closeJiraIssue
} = await import('../src/jira.js')

describe('Jira API Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('createJiraClient', () => {
    it('should create axios instance with correct configuration', () => {
      const client = createJiraClient(
        'https://company.atlassian.net',
        'user@company.com',
        'api-token'
      )

      expect(mockAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://company.atlassian.net/rest/api/2',
        auth: {
          username: 'user@company.com',
          password: 'api-token'
        },
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        }
      })

      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled()
      expect(client).toBe(mockAxiosInstance)
    })
  })

  describe('calculateDueDate', () => {
    // Mock Date to make tests deterministic
    const originalDate = Date

    beforeAll(() => {
      // Mock Date constructor to return a new Date object each time
      global.Date = jest.fn().mockImplementation((dateString) => {
        if (dateString) {
          return new originalDate(dateString)
        }
        return new originalDate('2023-01-15T10:00:00Z')
      })
      // Copy static methods
      global.Date.now = originalDate.now
      global.Date.UTC = originalDate.UTC
      global.Date.parse = originalDate.parse
      global.Date.prototype = originalDate.prototype
    })

    afterAll(() => {
      global.Date = originalDate
    })

    it('should calculate due date for critical severity', () => {
      const dueDaysConfig = { critical: 1, high: 7, medium: 30, low: 90 }
      const alertCreatedAt = '2023-01-10T08:00:00Z'

      const result = calculateDueDate('critical', dueDaysConfig, alertCreatedAt)

      expect(result).toBe('2023-01-11') // 1 day from alert creation date
    })

    it('should calculate due date for high severity', () => {
      const dueDaysConfig = { critical: 1, high: 7, medium: 30, low: 90 }
      const alertCreatedAt = '2023-01-10T08:00:00Z'

      const result = calculateDueDate('high', dueDaysConfig, alertCreatedAt)

      expect(result).toBe('2023-01-17') // 7 days from alert creation date
    })

    it('should calculate due date for medium severity', () => {
      const dueDaysConfig = { critical: 1, high: 7, medium: 30, low: 90 }
      const alertCreatedAt = '2023-01-10T08:00:00Z'

      const result = calculateDueDate('medium', dueDaysConfig, alertCreatedAt)

      expect(result).toBe('2023-02-09') // 30 days from alert creation date
    })

    it('should calculate due date for low severity', () => {
      const dueDaysConfig = { critical: 1, high: 7, medium: 30, low: 90 }
      const alertCreatedAt = '2023-01-10T08:00:00Z'

      const result = calculateDueDate('low', dueDaysConfig, alertCreatedAt)

      expect(result).toBe('2023-04-10') // 90 days from alert creation date
    })

    it('should default to medium severity for unknown severity', () => {
      const dueDaysConfig = { critical: 1, high: 7, medium: 30, low: 90 }
      const alertCreatedAt = '2023-01-10T08:00:00Z'

      const result = calculateDueDate('unknown', dueDaysConfig, alertCreatedAt)

      expect(result).toBe('2023-02-09') // 30 days (medium default) from alert creation date
    })

    it('should use fallback values if config is missing', () => {
      const alertCreatedAt = '2023-01-10T08:00:00Z'

      const result = calculateDueDate('critical', {}, alertCreatedAt)

      expect(result).toBe('2023-01-11') // 1 day fallback from alert creation date
    })

    it('should use current date when createdAt is not provided', () => {
      const dueDaysConfig = { critical: 1, high: 7, medium: 30, low: 90 }

      const result = calculateDueDate('critical', dueDaysConfig)

      expect(result).toBe('2023-01-16') // 1 day from mock current date
    })
  })

  describe('findExistingIssue', () => {
    it('should find existing issue', async () => {
      const mockResponse = {
        data: {
          issues: [
            {
              key: 'SEC-123',
              summary: 'Dependabot Alert #42: Test vulnerability',
              status: { name: 'Open' },
              updated: '2023-01-01T00:00:00Z'
            }
          ]
        }
      }

      mockAxiosInstance.get.mockResolvedValue(mockResponse)

      const result = await findExistingIssue(mockAxiosInstance, 'SEC', 42)

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/search', {
        params: {
          jql: 'project = "SEC" AND summary ~ "Dependabot Alert #42"',
          fields: 'key,summary,status,updated'
        }
      })

      expect(result).toEqual(mockResponse.data.issues[0])
    })

    it('should reject invalid project keys', async () => {
      await expect(
        findExistingIssue(mockAxiosInstance, 'SEC"; DROP TABLE alerts; --', 42)
      ).rejects.toThrow('Invalid project key format')
    })

    it('should reject invalid alert IDs', async () => {
      await expect(
        findExistingIssue(mockAxiosInstance, 'SEC', 'invalid')
      ).rejects.toThrow('Invalid alert ID')
    })

    it('should return null if no issues found', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: { issues: [] } })

      const result = await findExistingIssue(mockAxiosInstance, 'SEC', 42)

      expect(result).toBeNull()
    })

    it('should handle search errors gracefully', async () => {
      const searchError = new Error('Search failed')
      mockAxiosInstance.get.mockRejectedValue(searchError)

      const result = await findExistingIssue(mockAxiosInstance, 'SEC', 42)

      expect(result).toBeNull()
      expect(mockCore.warning).toHaveBeenCalledWith(
        'Failed to search for existing issue: Search failed'
      )
    })
  })

  describe('createJiraIssue', () => {
    const mockConfig = {
      projectKey: 'SEC',
      issueType: 'Bug',
      priority: 'High',
      labels: 'dependabot,security',
      assignee: 'security-team',
      dueDays: { critical: 1, high: 7, medium: 30, low: 90 }
    }

    const mockAlert = {
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
      url: 'https://github.com/company/repo/security/dependabot/42'
    }

    // Mock Date for consistent due date calculation
    const originalDate = Date
    beforeAll(() => {
      global.Date = jest.fn().mockImplementation((dateString) => {
        if (dateString) {
          return new originalDate(dateString)
        }
        return new originalDate('2023-01-15T10:00:00Z')
      })
      global.Date.now = originalDate.now
      global.Date.UTC = originalDate.UTC
      global.Date.parse = originalDate.parse
      global.Date.prototype = originalDate.prototype
    })

    afterAll(() => {
      global.Date = originalDate
    })

    it('should create Jira issue with correct data', async () => {
      const mockResponse = { data: { key: 'SEC-123' } }
      mockAxiosInstance.post.mockResolvedValue(mockResponse)

      const result = await createJiraIssue(
        mockAxiosInstance,
        mockConfig,
        mockAlert,
        false
      )

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/issue',
        expect.objectContaining({
          fields: expect.objectContaining({
            project: { key: 'SEC' },
            summary: 'Dependabot Alert #42: Critical vulnerability in lodash',
            issuetype: { name: 'Bug' },
            priority: { name: 'High' },
            duedate: '2023-01-16', // 1 day for critical
            labels: ['dependabot', 'security'],
            assignee: { name: 'security-team' }
          })
        })
      )

      expect(result).toEqual({ key: 'SEC-123' })
      expect(mockCore.info).toHaveBeenCalledWith('Created Jira issue: SEC-123')
    })

    it('should handle dry run mode', async () => {
      const result = await createJiraIssue(
        mockAxiosInstance,
        mockConfig,
        mockAlert,
        true
      )

      expect(mockAxiosInstance.post).not.toHaveBeenCalled()
      expect(result).toEqual({ key: 'DRY-RUN-KEY', dryRun: true })
      expect(mockCore.info).toHaveBeenCalledWith(
        '[DRY RUN] Would create Jira issue: Dependabot Alert #42: Critical vulnerability in lodash'
      )
    })

    it('should create issue without optional fields', async () => {
      const minimalConfig = {
        projectKey: 'SEC',
        issueType: 'Bug',
        priority: 'Medium',
        dueDays: { medium: 30 }
      }

      const mockResponse = { data: { key: 'SEC-124' } }
      mockAxiosInstance.post.mockResolvedValue(mockResponse)

      await createJiraIssue(mockAxiosInstance, minimalConfig, mockAlert, false)

      const issueData = mockAxiosInstance.post.mock.calls[0][1]
      expect(issueData.fields.labels).toBeUndefined()
      expect(issueData.fields.assignee).toBeUndefined()
    })

    it('should handle Jira API errors', async () => {
      const apiError = new Error('Jira create issue failed')
      mockAxiosInstance.post.mockRejectedValue(apiError)

      await expect(
        createJiraIssue(mockAxiosInstance, mockConfig, mockAlert, false)
      ).rejects.toThrow('Jira create issue failed')

      expect(mockCore.error).toHaveBeenCalledWith(
        'Failed to create Jira issue: Jira create issue failed'
      )
    })
  })

  describe('updateJiraIssue', () => {
    const mockAlert = {
      id: 42,
      state: 'dismissed',
      updatedAt: '2023-01-15T10:00:00Z',
      dismissedAt: '2023-01-14T15:30:00Z',
      dismissedReason: 'tolerable_risk',
      dismissedComment: 'Risk accepted by security team',
      url: 'https://github.com/company/repo/security/dependabot/42'
    }

    it('should update Jira issue with comment', async () => {
      mockAxiosInstance.post.mockResolvedValue({})

      const result = await updateJiraIssue(
        mockAxiosInstance,
        'SEC-123',
        mockAlert,
        false
      )

      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/issue/SEC-123/comment',
        {
          body: expect.stringContaining('*Dependabot Alert Updated*')
        }
      )

      const commentBody = mockAxiosInstance.post.mock.calls[0][1].body
      expect(commentBody).toContain('*Current Status:* dismissed')
      expect(commentBody).toContain('*Dismissed Reason:* tolerable_risk')
      expect(commentBody).toContain('Risk accepted by security team')

      expect(result).toEqual({ updated: true })
      expect(mockCore.info).toHaveBeenCalledWith('Updated Jira issue: SEC-123')
    })

    it('should handle dry run mode', async () => {
      const result = await updateJiraIssue(
        mockAxiosInstance,
        'SEC-123',
        mockAlert,
        true
      )

      expect(mockAxiosInstance.post).not.toHaveBeenCalled()
      expect(result).toEqual({ updated: true, dryRun: true })
      expect(mockCore.info).toHaveBeenCalledWith(
        '[DRY RUN] Would update Jira issue SEC-123 with comment'
      )
    })

    it('should handle update errors', async () => {
      const apiError = new Error('Jira update failed')
      mockAxiosInstance.post.mockRejectedValue(apiError)

      await expect(
        updateJiraIssue(mockAxiosInstance, 'SEC-123', mockAlert, false)
      ).rejects.toThrow('Jira update failed')

      expect(mockCore.error).toHaveBeenCalledWith(
        'Failed to update Jira issue SEC-123: Jira update failed'
      )
    })
  })

  describe('findOpenDependabotIssues', () => {
    it('should find open Dependabot issues', async () => {
      const mockResponse = {
        data: {
          issues: [
            {
              key: 'SEC-123',
              summary: 'Dependabot Alert #42: Critical vulnerability',
              description: 'Alert description',
              status: { name: 'Open' }
            },
            {
              key: 'SEC-124',
              summary: 'Dependabot Alert #43: High vulnerability',
              description: 'Another alert',
              status: { name: 'In Progress' }
            }
          ]
        }
      }

      mockAxiosInstance.get.mockResolvedValue(mockResponse)

      const result = await findOpenDependabotIssues(mockAxiosInstance, 'SEC')

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/search', {
        params: {
          jql: 'project = "SEC" AND labels = "dependabot" AND resolution IS EMPTY',
          fields: 'key,summary,description,status',
          maxResults: 100
        }
      })

      expect(result).toHaveLength(2)
      expect(result[0].key).toBe('SEC-123')
      expect(result[1].key).toBe('SEC-124')
      expect(mockCore.info).toHaveBeenCalledWith(
        'Found 2 open Dependabot issues'
      )
    })

    it('should reject invalid project keys', async () => {
      await expect(
        findOpenDependabotIssues(mockAxiosInstance, 'SEC"; OR 1=1; --')
      ).rejects.toThrow('Invalid project key format')
    })

    it('should handle empty search results', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: { issues: [] } })

      const result = await findOpenDependabotIssues(mockAxiosInstance, 'SEC')

      expect(result).toHaveLength(0)
      expect(mockCore.info).toHaveBeenCalledWith(
        'Found 0 open Dependabot issues'
      )
    })

    it('should handle search errors gracefully', async () => {
      const searchError = new Error('JQL syntax error')
      mockAxiosInstance.get.mockRejectedValue(searchError)

      const result = await findOpenDependabotIssues(mockAxiosInstance, 'SEC')

      expect(result).toHaveLength(0)
      expect(mockCore.warning).toHaveBeenCalledWith(
        'Failed to search for open Dependabot issues: JQL syntax error'
      )
    })
  })

  describe('extractAlertIdFromIssue', () => {
    it('should extract alert ID from summary', () => {
      const issue = {
        key: 'SEC-123',
        summary: 'Dependabot Alert #42: Critical vulnerability in lodash',
        description: 'Some description'
      }

      const result = extractAlertIdFromIssue(issue)

      expect(result).toBe('42')
    })

    it('should extract alert ID from description if not in summary', () => {
      const issue = {
        key: 'SEC-123',
        summary: 'Security Issue: lodash vulnerability',
        description: 'Alert ID: 123\nThis is a security vulnerability...'
      }

      const result = extractAlertIdFromIssue(issue)

      expect(result).toBe('123')
    })

    it('should prioritize summary over description', () => {
      const issue = {
        key: 'SEC-123',
        summary: 'Dependabot Alert #42: Critical vulnerability',
        description: 'Alert ID: 999\nThis should not be used'
      }

      const result = extractAlertIdFromIssue(issue)

      expect(result).toBe('42')
    })

    it('should return null when no alert ID found', () => {
      const issue = {
        key: 'SEC-123',
        summary: 'Manual security issue',
        description: 'This is not a Dependabot alert'
      }

      const result = extractAlertIdFromIssue(issue)

      expect(result).toBeNull()
      expect(mockCore.warning).toHaveBeenCalledWith(
        'Could not extract alert ID from issue SEC-123'
      )
    })

    it('should handle missing summary and description', () => {
      const issue = {
        key: 'SEC-123'
      }

      const result = extractAlertIdFromIssue(issue)

      expect(result).toBeNull()
      expect(mockCore.warning).toHaveBeenCalledWith(
        'Could not extract alert ID from issue SEC-123'
      )
    })
  })

  describe('closeJiraIssue', () => {
    beforeEach(() => {
      // Mock transitions response
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          transitions: [
            { id: '31', name: 'Done' },
            { id: '21', name: 'In Progress' },
            { id: '41', name: 'Resolved' }
          ]
        }
      })
    })

    it('should close issue with transition and comment', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: {} })

      const result = await closeJiraIssue(
        mockAxiosInstance,
        'SEC-123',
        'Done',
        'Alert was resolved in GitHub',
        false
      )

      // Should get available transitions
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/issue/SEC-123/transitions'
      )

      // Should add comment
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/issue/SEC-123/comment',
        {
          body: 'Alert was resolved in GitHub'
        }
      )

      // Should perform transition
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/issue/SEC-123/transitions',
        {
          transition: {
            id: '31'
          }
        }
      )

      expect(result).toEqual({ closed: true })
      expect(mockCore.info).toHaveBeenCalledWith(
        'Closed Jira issue: SEC-123 using transition "Done"'
      )
    })

    it('should handle dry run mode', async () => {
      const result = await closeJiraIssue(
        mockAxiosInstance,
        'SEC-123',
        'Done',
        'Test comment',
        true
      )

      expect(mockAxiosInstance.get).not.toHaveBeenCalled()
      expect(mockAxiosInstance.post).not.toHaveBeenCalled()
      expect(result).toEqual({ closed: false, dryRun: true })
      expect(mockCore.info).toHaveBeenCalledWith(
        '[DRY RUN] Would close Jira issue SEC-123 with transition "Done"'
      )
    })

    it('should handle case-insensitive transition names', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: {} })

      await closeJiraIssue(
        mockAxiosInstance,
        'SEC-123',
        'done', // lowercase
        'Test comment',
        false
      )

      // Should still find the "Done" transition
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/issue/SEC-123/transitions',
        {
          transition: {
            id: '31'
          }
        }
      )
    })

    it('should error when transition not available', async () => {
      await expect(
        closeJiraIssue(
          mockAxiosInstance,
          'SEC-123',
          'Invalid Transition',
          'Test comment',
          false
        )
      ).rejects.toThrow(
        'Transition "Invalid Transition" not available. Available transitions: Done, In Progress, Resolved'
      )
    })

    it('should handle API errors', async () => {
      const apiError = new Error('Transition failed')
      mockAxiosInstance.post
        .mockResolvedValueOnce({ data: {} }) // Comment succeeds
        .mockRejectedValueOnce(apiError) // Transition fails

      await expect(
        closeJiraIssue(
          mockAxiosInstance,
          'SEC-123',
          'Done',
          'Test comment',
          false
        )
      ).rejects.toThrow('Transition failed')

      expect(mockCore.error).toHaveBeenCalledWith(
        'Failed to close Jira issue SEC-123: Transition failed'
      )
    })

    it('should work without comment', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: {} })

      await closeJiraIssue(
        mockAxiosInstance,
        'SEC-123',
        'Done',
        '', // No comment
        false
      )

      // Should only call transition, not comment API
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1)
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/issue/SEC-123/transitions',
        {
          transition: {
            id: '31'
          }
        }
      )
    })
  })
})
