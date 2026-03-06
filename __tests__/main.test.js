/**
 * Unit tests for the action's main functionality, src/main.js
 */
import { jest } from '@jest/globals'

// Mock modules
const mockCore = {
  getInput: jest.fn(),
  getBooleanInput: jest.fn(),
  setOutput: jest.fn(),
  setFailed: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}

const mockGithub = {
  getRepoInfo: jest.fn(),
  getDependabotAlerts: jest.fn(),
  parseAlert: jest.fn(),
  getAlertStatus: jest.fn(),
  groupAlertsByAdvisory: jest.fn()
}

const mockJira = {
  createJiraClient: jest.fn(),
  findExistingIssue: jest.fn(),
  createJiraIssue: jest.fn(),
  updateJiraIssue: jest.fn(),
  findOpenDependabotIssues: jest.fn(),
  extractAlertIdFromIssue: jest.fn(),
  closeJiraIssue: jest.fn(),
  findExistingAdvisoryIssue: jest.fn(),
  createAdvisoryJiraIssue: jest.fn(),
  updateAdvisoryJiraIssue: jest.fn(),
  extractAdvisoryInfoFromIssue: jest.fn()
}

// Mock the modules before importing the main function
jest.unstable_mockModule('@actions/core', () => mockCore)
jest.unstable_mockModule('../src/github.js', () => mockGithub)
jest.unstable_mockModule('../src/jira.js', () => mockJira)

// Import the module being tested
const { run } = await import('../src/main.js')

describe('Dependabot Jira Sync', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()

    // Set default environment variable
    process.env.GITHUB_REPOSITORY = 'test-owner/test-repo'

    // Set default inputs
    mockCore.getInput.mockImplementation((name) => {
      const inputs = {
        'github-token': 'test-token',
        'jira-url': 'https://test.atlassian.net',
        'jira-username': 'test@example.com',
        'jira-api-token': 'test-api-token',
        'jira-project-key': 'TEST',
        'jira-issue-type': 'Bug',
        'jira-priority': 'Medium',
        'jira-labels': 'dependabot,security',
        'severity-threshold': 'medium',
        'critical-due-days': '1',
        'high-due-days': '7',
        'medium-due-days': '30',
        'low-due-days': '90'
      }
      return inputs[name] || ''
    })

    mockCore.getBooleanInput.mockImplementation((name) => {
      const booleanInputs = {
        'exclude-dismissed': true,
        'update-existing': true,
        'auto-close-resolved': false,
        'dry-run': false
      }
      return booleanInputs[name] || false
    })

    // Mock GitHub functions
    mockGithub.getRepoInfo.mockReturnValue({
      owner: 'test-owner',
      repo: 'test-repo'
    })

    mockGithub.getDependabotAlerts.mockResolvedValue([])

    // Mock Jira functions
    mockJira.createJiraClient.mockReturnValue({
      // Mock Jira client
    })

    mockJira.findExistingIssue.mockResolvedValue(null)
    mockJira.createJiraIssue.mockResolvedValue({ key: 'TEST-123' })
    mockJira.updateJiraIssue.mockResolvedValue({ updated: true })
  })

  afterEach(() => {
    delete process.env.GITHUB_REPOSITORY
  })

  it('processes no alerts successfully', async () => {
    mockGithub.getDependabotAlerts.mockResolvedValue([])

    await run()

    expect(mockCore.setOutput).toHaveBeenCalledWith('issues-created', '0')
    expect(mockCore.setOutput).toHaveBeenCalledWith('issues-updated', '0')
    expect(mockCore.setOutput).toHaveBeenCalledWith('alerts-processed', '0')
    expect(mockCore.setOutput).toHaveBeenCalledWith(
      'summary',
      'No alerts to process'
    )
    expect(mockCore.info).toHaveBeenCalledWith(
      '✅ No Dependabot alerts found matching the criteria'
    )
  })

  it('creates new Jira issues for alerts', async () => {
    const mockAlert = {
      number: 1,
      security_advisory: {
        summary: 'Test vulnerability',
        description: 'A test vulnerability',
        severity: 'high'
      },
      dependency: {
        package: { name: 'test-package', ecosystem: 'npm' }
      },
      html_url: 'https://github.com/test/alert/1',
      created_at: '2023-01-01T00:00:00Z',
      updated_at: '2023-01-01T00:00:00Z',
      state: 'open'
    }

    const parsedAlert = {
      id: 1,
      title: 'Test vulnerability',
      description: 'A test vulnerability',
      severity: 'high',
      package: 'test-package',
      ecosystem: 'npm'
    }

    mockGithub.getDependabotAlerts.mockResolvedValue([mockAlert])
    mockGithub.parseAlert.mockReturnValue(parsedAlert)
    mockJira.findExistingIssue.mockResolvedValue(null)
    mockJira.createJiraIssue.mockResolvedValue({ key: 'TEST-123' })

    await run()

    expect(mockJira.createJiraIssue).toHaveBeenCalledWith(
      expect.any(Object), // jiraClient
      expect.objectContaining({
        projectKey: 'TEST',
        issueType: 'Bug',
        priority: 'Medium'
      }),
      parsedAlert,
      false // dryRun
    )

    expect(mockCore.setOutput).toHaveBeenCalledWith('issues-created', '1')
    expect(mockCore.setOutput).toHaveBeenCalledWith('issues-updated', '0')
    expect(mockCore.setOutput).toHaveBeenCalledWith('alerts-processed', '1')
  })

  it('updates existing Jira issues', async () => {
    const mockAlert = {
      number: 1,
      security_advisory: {
        summary: 'Test vulnerability',
        severity: 'medium'
      },
      dependency: {
        package: { name: 'test-package' }
      },
      html_url: 'https://github.com/test/alert/1',
      state: 'open'
    }

    const parsedAlert = {
      id: 1,
      title: 'Test vulnerability',
      severity: 'medium'
    }

    const existingIssue = { key: 'TEST-456' }

    mockGithub.getDependabotAlerts.mockResolvedValue([mockAlert])
    mockGithub.parseAlert.mockReturnValue(parsedAlert)
    mockJira.findExistingIssue.mockResolvedValue(existingIssue)

    await run()

    expect(mockJira.updateJiraIssue).toHaveBeenCalledWith(
      expect.any(Object), // jiraClient
      'TEST-456',
      parsedAlert,
      false // dryRun
    )

    expect(mockCore.setOutput).toHaveBeenCalledWith('issues-created', '0')
    expect(mockCore.setOutput).toHaveBeenCalledWith('issues-updated', '1')
  })

  it('handles dry run mode', async () => {
    mockCore.getBooleanInput.mockImplementation((name) => {
      if (name === 'dry-run') return true
      return false
    })

    const mockAlert = {
      number: 1,
      security_advisory: { summary: 'Test', severity: 'high' },
      dependency: { package: { name: 'test' } },
      html_url: 'https://test.com',
      state: 'open'
    }

    mockGithub.getDependabotAlerts.mockResolvedValue([mockAlert])
    mockGithub.parseAlert.mockReturnValue({ id: 1, severity: 'high' })
    mockJira.findExistingIssue.mockResolvedValue(null)
    mockJira.createJiraIssue.mockResolvedValue({
      key: 'DRY-RUN-KEY',
      dryRun: true
    })

    await run()

    expect(mockCore.warning).toHaveBeenCalledWith(
      '🧪 DRY RUN MODE - No changes will be made'
    )
    expect(mockJira.createJiraIssue).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.any(Object),
      true // dryRun = true
    )
  })

  it('handles missing required inputs', async () => {
    mockCore.getInput.mockImplementation((name, options) => {
      if (options?.required && name === 'jira-url') {
        throw new Error(`Input required and not supplied: ${name}`)
      }
      return ''
    })

    await run()

    expect(mockCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Input required and not supplied: jira-url')
    )
  })

  it('handles GitHub API errors', async () => {
    mockGithub.getDependabotAlerts.mockRejectedValue(
      new Error('GitHub API rate limit exceeded')
    )

    await run()

    expect(mockCore.setFailed).toHaveBeenCalledWith(
      'GitHub API rate limit exceeded'
    )
  })

  it('fails the run when Jira processing errors occur', async () => {
    const mockAlert = {
      number: 99,
      security_advisory: { summary: 'Failing alert', severity: 'high' },
      dependency: { package: { name: 'test' } },
      html_url: 'https://test.com',
      state: 'open'
    }

    const parsedAlert = { id: 99, title: 'Failing alert', severity: 'high' }

    mockGithub.getDependabotAlerts.mockResolvedValue([mockAlert])
    mockGithub.parseAlert.mockReturnValue(parsedAlert)
    mockJira.findExistingIssue.mockResolvedValue(null)
    mockJira.createJiraIssue.mockRejectedValue(new Error('Jira blew up'))

    await run()

    expect(mockCore.setFailed).toHaveBeenCalledWith(
      'Failed to process 1 alert(s); see logs for details'
    )
  })

  it('auto-closes resolved Jira issues when enabled', async () => {
    mockCore.getBooleanInput.mockImplementation((name) => {
      if (name === 'auto-close-resolved') return true
      return false
    })

    const mockAlert = {
      number: 7,
      security_advisory: { summary: 'Test', severity: 'high' },
      dependency: { package: { name: 'pkg' } },
      html_url: 'https://example.com',
      state: 'open'
    }

    const parsedAlert = { id: 7, title: 'Test', severity: 'high' }

    mockGithub.getDependabotAlerts.mockResolvedValue([mockAlert])
    mockGithub.parseAlert.mockReturnValue(parsedAlert)
    mockJira.findExistingIssue.mockResolvedValue(null)
    mockJira.createJiraIssue.mockResolvedValue({ key: 'TEST-7' })

    // Auto-close path
    mockJira.findOpenDependabotIssues.mockResolvedValue([{ key: 'TEST-1' }])
    mockJira.extractAlertIdFromIssue.mockReturnValue('7')
    mockGithub.getAlertStatus.mockResolvedValue('fixed')
    mockJira.closeJiraIssue.mockResolvedValue({ closed: true })

    await run()

    expect(mockJira.closeJiraIssue).toHaveBeenCalledWith(
      expect.any(Object),
      'TEST-1',
      'Done',
      expect.stringContaining('Alert was fixed'),
      false
    )
    expect(mockCore.setOutput).toHaveBeenCalledWith('issues-closed', '1')
  })

  describe('deduplicate-by-advisory mode', () => {
    beforeEach(() => {
      mockCore.getBooleanInput.mockImplementation((name) => {
        const booleanInputs = {
          'exclude-dismissed': true,
          'update-existing': true,
          'auto-close-resolved': false,
          'deduplicate-by-advisory': true,
          'dry-run': false
        }
        return booleanInputs[name] || false
      })
    })

    it('groups alerts by advisory and creates one issue per advisory', async () => {
      const rawAlerts = [
        {
          number: 1,
          security_advisory: {
            summary: 'Prototype pollution in lodash',
            description: 'desc',
            severity: 'critical',
            ghsa_id: 'GHSA-jf85-cpcp-j695',
            cve_id: 'CVE-2019-10744'
          },
          dependency: { package: { name: 'lodash', ecosystem: 'npm' } },
          html_url: 'https://github.com/test/alert/1',
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T00:00:00Z',
          state: 'open'
        },
        {
          number: 2,
          security_advisory: {
            summary: 'Prototype pollution in lodash',
            description: 'desc',
            severity: 'critical',
            ghsa_id: 'GHSA-jf85-cpcp-j695',
            cve_id: 'CVE-2019-10744'
          },
          dependency: { package: { name: 'lodash', ecosystem: 'npm' } },
          html_url: 'https://github.com/test/alert/2',
          created_at: '2023-01-02T00:00:00Z',
          updated_at: '2023-01-02T00:00:00Z',
          state: 'open'
        }
      ]

      const parsedAlert1 = {
        id: 1,
        title: 'Prototype pollution in lodash',
        severity: 'critical',
        ghsaId: 'GHSA-jf85-cpcp-j695',
        cveId: 'CVE-2019-10744',
        package: 'lodash',
        url: 'https://github.com/test/alert/1',
        createdAt: '2023-01-01T00:00:00Z'
      }

      const parsedAlert2 = {
        id: 2,
        title: 'Prototype pollution in lodash',
        severity: 'critical',
        ghsaId: 'GHSA-jf85-cpcp-j695',
        cveId: 'CVE-2019-10744',
        package: 'lodash',
        url: 'https://github.com/test/alert/2',
        createdAt: '2023-01-02T00:00:00Z'
      }

      const advisoryGroup = {
        isAdvisoryGroup: true,
        advisoryId: 'GHSA-jf85-cpcp-j695',
        alertIds: [1, 2],
        alerts: [parsedAlert1, parsedAlert2],
        severity: 'critical',
        title: 'Prototype pollution in lodash'
      }

      mockGithub.getDependabotAlerts.mockResolvedValue(rawAlerts)
      mockGithub.parseAlert
        .mockReturnValueOnce(parsedAlert1)
        .mockReturnValueOnce(parsedAlert2)
      mockGithub.groupAlertsByAdvisory.mockReturnValue({
        advisoryGroups: [advisoryGroup],
        ungroupedAlerts: []
      })
      mockJira.findExistingAdvisoryIssue.mockResolvedValue(null)
      mockJira.createAdvisoryJiraIssue.mockResolvedValue({ key: 'SEC-200' })

      await run()

      expect(mockGithub.groupAlertsByAdvisory).toHaveBeenCalled()
      expect(mockJira.createAdvisoryJiraIssue).toHaveBeenCalledTimes(1)
      expect(mockJira.createAdvisoryJiraIssue).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ projectKey: 'TEST' }),
        advisoryGroup,
        false
      )
      expect(mockCore.setOutput).toHaveBeenCalledWith('issues-created', '1')
    })

    it('updates existing advisory issue when found', async () => {
      const rawAlert = {
        number: 1,
        security_advisory: {
          summary: 'Vuln',
          severity: 'high',
          ghsa_id: 'GHSA-aaaa-bbbb-cccc'
        },
        dependency: { package: { name: 'pkg' } },
        html_url: 'https://github.com/test/alert/1',
        state: 'open'
      }

      const parsedAlert = {
        id: 1,
        title: 'Vuln',
        severity: 'high',
        ghsaId: 'GHSA-aaaa-bbbb-cccc',
        cveId: null,
        package: 'pkg'
      }

      const advisoryGroup = {
        isAdvisoryGroup: true,
        advisoryId: 'GHSA-aaaa-bbbb-cccc',
        alertIds: [1],
        alerts: [parsedAlert],
        severity: 'high',
        title: 'Vuln'
      }

      mockGithub.getDependabotAlerts.mockResolvedValue([rawAlert])
      mockGithub.parseAlert.mockReturnValue(parsedAlert)
      mockGithub.groupAlertsByAdvisory.mockReturnValue({
        advisoryGroups: [advisoryGroup],
        ungroupedAlerts: []
      })

      const existingIssue = {
        key: 'SEC-100',
        summary: 'Advisory GHSA-aaaa-bbbb-cccc [#1]: Vuln'
      }
      mockJira.findExistingAdvisoryIssue.mockResolvedValue(existingIssue)
      mockJira.updateAdvisoryJiraIssue.mockResolvedValue({ updated: true })

      await run()

      expect(mockJira.updateAdvisoryJiraIssue).toHaveBeenCalledWith(
        expect.any(Object),
        'SEC-100',
        'Advisory GHSA-aaaa-bbbb-cccc [#1]: Vuln',
        advisoryGroup,
        false
      )
      expect(mockCore.setOutput).toHaveBeenCalledWith('issues-updated', '1')
    })

    it('processes ungrouped alerts individually', async () => {
      const rawAlert = {
        number: 5,
        security_advisory: { summary: 'No advisory ID', severity: 'low' },
        dependency: { package: { name: 'pkg' } },
        html_url: 'https://github.com/test/alert/5',
        state: 'open'
      }

      const parsedAlert = {
        id: 5,
        title: 'No advisory ID',
        severity: 'low',
        ghsaId: null,
        cveId: null,
        package: 'pkg'
      }

      mockGithub.getDependabotAlerts.mockResolvedValue([rawAlert])
      mockGithub.parseAlert.mockReturnValue(parsedAlert)
      mockGithub.groupAlertsByAdvisory.mockReturnValue({
        advisoryGroups: [],
        ungroupedAlerts: [parsedAlert]
      })
      mockJira.findExistingIssue.mockResolvedValue(null)
      mockJira.createJiraIssue.mockResolvedValue({ key: 'TEST-500' })

      await run()

      expect(mockJira.createJiraIssue).toHaveBeenCalledTimes(1)
      expect(mockCore.setOutput).toHaveBeenCalledWith('issues-created', '1')
    })

    it('auto-closes advisory issues when all alerts are resolved', async () => {
      mockCore.getBooleanInput.mockImplementation((name) => {
        const booleanInputs = {
          'exclude-dismissed': true,
          'update-existing': true,
          'auto-close-resolved': true,
          'deduplicate-by-advisory': true,
          'dry-run': false
        }
        return booleanInputs[name] || false
      })

      const rawAlert = {
        number: 3,
        security_advisory: {
          summary: 'Another vuln',
          severity: 'medium',
          ghsa_id: 'GHSA-zzzz-zzzz-zzzz'
        },
        dependency: { package: { name: 'other-pkg' } },
        html_url: 'https://github.com/test/alert/3',
        state: 'open'
      }
      const parsedAlert = {
        id: 3,
        title: 'Another vuln',
        severity: 'medium',
        ghsaId: 'GHSA-zzzz-zzzz-zzzz',
        cveId: null,
        package: 'other-pkg'
      }

      mockGithub.getDependabotAlerts.mockResolvedValue([rawAlert])
      mockGithub.parseAlert.mockReturnValue(parsedAlert)
      mockGithub.groupAlertsByAdvisory.mockReturnValue({
        advisoryGroups: [
          {
            isAdvisoryGroup: true,
            advisoryId: 'GHSA-zzzz-zzzz-zzzz',
            alertIds: [3],
            alerts: [parsedAlert],
            severity: 'medium',
            title: 'Another vuln'
          }
        ],
        ungroupedAlerts: []
      })
      mockJira.findExistingAdvisoryIssue.mockResolvedValue(null)
      mockJira.createAdvisoryJiraIssue.mockResolvedValue({ key: 'SEC-300' })

      mockJira.findOpenDependabotIssues.mockResolvedValue([
        {
          key: 'SEC-200',
          summary: 'Advisory GHSA-jf85-cpcp-j695 [#1, #2]: Prototype pollution'
        }
      ])

      mockJira.extractAdvisoryInfoFromIssue.mockReturnValue({
        advisoryId: 'GHSA-jf85-cpcp-j695',
        alertIds: ['1', '2']
      })

      mockGithub.getAlertStatus
        .mockResolvedValueOnce('fixed')
        .mockResolvedValueOnce('fixed')

      mockJira.closeJiraIssue.mockResolvedValue({ closed: true })

      await run()

      expect(mockJira.closeJiraIssue).toHaveBeenCalledWith(
        expect.any(Object),
        'SEC-200',
        'Done',
        expect.stringContaining('All 2 alert(s)'),
        false
      )
      expect(mockCore.setOutput).toHaveBeenCalledWith('issues-closed', '1')
    })

    it('keeps advisory issue open when not all alerts are resolved', async () => {
      mockCore.getBooleanInput.mockImplementation((name) => {
        const booleanInputs = {
          'exclude-dismissed': true,
          'update-existing': true,
          'auto-close-resolved': true,
          'deduplicate-by-advisory': true,
          'dry-run': false
        }
        return booleanInputs[name] || false
      })

      const rawAlert = {
        number: 3,
        security_advisory: {
          summary: 'Another vuln',
          severity: 'medium',
          ghsa_id: 'GHSA-zzzz-zzzz-zzzz'
        },
        dependency: { package: { name: 'other-pkg' } },
        html_url: 'https://github.com/test/alert/3',
        state: 'open'
      }
      const parsedAlert = {
        id: 3,
        title: 'Another vuln',
        severity: 'medium',
        ghsaId: 'GHSA-zzzz-zzzz-zzzz',
        cveId: null,
        package: 'other-pkg'
      }

      mockGithub.getDependabotAlerts.mockResolvedValue([rawAlert])
      mockGithub.parseAlert.mockReturnValue(parsedAlert)
      mockGithub.groupAlertsByAdvisory.mockReturnValue({
        advisoryGroups: [
          {
            isAdvisoryGroup: true,
            advisoryId: 'GHSA-zzzz-zzzz-zzzz',
            alertIds: [3],
            alerts: [parsedAlert],
            severity: 'medium',
            title: 'Another vuln'
          }
        ],
        ungroupedAlerts: []
      })
      mockJira.findExistingAdvisoryIssue.mockResolvedValue(null)
      mockJira.createAdvisoryJiraIssue.mockResolvedValue({ key: 'SEC-300' })

      mockJira.findOpenDependabotIssues.mockResolvedValue([
        {
          key: 'SEC-200',
          summary: 'Advisory GHSA-jf85-cpcp-j695 [#1, #2]: Prototype pollution'
        }
      ])

      mockJira.extractAdvisoryInfoFromIssue.mockReturnValue({
        advisoryId: 'GHSA-jf85-cpcp-j695',
        alertIds: ['1', '2']
      })

      mockGithub.getAlertStatus
        .mockResolvedValueOnce('fixed')
        .mockResolvedValueOnce('open')

      await run()

      expect(mockJira.closeJiraIssue).not.toHaveBeenCalled()
      expect(mockCore.setOutput).toHaveBeenCalledWith('issues-closed', '0')
    })
  })

  it('validates config inputs and fails fast on invalid values', async () => {
    mockCore.getInput.mockImplementation((name, options) => {
      const inputs = {
        'jira-url': 'not-a-url',
        'jira-username': 'user@test.com',
        'jira-api-token': 'token',
        'jira-project-key': 'BAD KEY', // space invalid
        'severity-threshold': 'invalid',
        'critical-due-days': '0', // out of range
        'high-due-days': '7',
        'medium-due-days': '30',
        'low-due-days': '90'
      }
      if (options?.required && !inputs[name]) {
        throw new Error(`Input required and not supplied: ${name}`)
      }
      return inputs[name] || ''
    })

    mockCore.getBooleanInput.mockReturnValue(false)

    await run()

    expect(mockCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Invalid Jira URL format')
    )
  })
})
