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
  getAlertStatus: jest.fn()
}

const mockJira = {
  createJiraClient: jest.fn(),
  findExistingIssue: jest.fn(),
  createJiraIssue: jest.fn(),
  updateJiraIssue: jest.fn(),
  findOpenDependabotIssues: jest.fn(),
  extractAlertIdFromIssue: jest.fn(),
  closeJiraIssue: jest.fn()
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
