# Dependabot Jira Sync Action

![CI](https://github.com/threemonkeysconsulting/dependabot-jira-sync-action/actions/workflows/ci.yml/badge.svg)
![Code Coverage](./badges/coverage.svg)

A GitHub Action that automatically syncs Dependabot security alerts to Jira
issues with **configurable due dates based on severity levels**.

🏢 **Enterprise-ready** with GitHub App authentication for enhanced security and
scalability.

## ⚠️ Upgrade Notes (Jan 4, 2025)

### Recent Changes

**Error Handling (Breaking Change):**

- Jira API errors now **fail the workflow** instead of silently continuing
- This ensures you're notified when sync issues occur
- If your workflow was previously "succeeding" with errors, it may now fail -
  check your logs

**Priority Field:**

- Priority is now **optional** - automatically omitted for Jira projects that
  don't support it (e.g., next-gen projects)
- If your project doesn't have a priority field, the action will work without it
- No action needed - this is backward compatible

**Jira API Updates:**

- Updated to use the latest Jira REST API v3 endpoints
- All endpoints verified against current Jira Cloud documentation

## ✨ Features

- 🔐 **Enterprise-Ready Authentication**: GitHub App authentication
  (recommended) with fine-grained permissions and auto-rotating tokens
- 🛡️ **Automatic Security Alert Sync**: Fetches Dependabot alerts and creates
  corresponding Jira issues
- ⏰ **Severity-Based Due Dates**: Configure different due dates for critical,
  high, medium, and low severity alerts (calculated from alert creation date)
- 🔄 **Smart Updates**: Updates existing Jira issues when alerts change or are
  dismissed
- 🎯 **Auto-Close Resolved Issues**: Automatically closes Jira issues when
  Dependabot alerts are fixed or dismissed in GitHub
- 🧪 **Dry Run Mode**: Test the action without making actual changes
- 🎯 **Flexible Filtering**: Filter by severity threshold and dismissed status
- 📝 **Rich Issue Details**: Includes vulnerability details, CVSS scores, CVE
  IDs, and GitHub links
- 🔧 **Highly Configurable**: Customize Jira project, issue types, priorities,
  labels, and assignments
- 🧪 **Comprehensive Testing**: 80%+ code coverage with extensive unit tests

## 🚀 Quick Start

### 1. Set up Secrets

Go to `Settings → Secrets and variables → Actions` and add:

**Required Secrets:**

- `JIRA_API_TOKEN` - Your Jira API token
  ([how to create](https://id.atlassian.com/manage-profile/security/api-tokens))
- `DEPENDABOT_APP_ID` - GitHub App ID (or use `DEPENDABOT_PAT` instead)
- `DEPENDABOT_APP_PRIVATE_KEY` - GitHub App private key
- `DEPENDABOT_APP_INSTALLATION_ID` - GitHub App installation ID

**Optional Variables** (can also use secrets):

- `JIRA_URL` - Your Jira instance URL (e.g., `https://company.atlassian.net`)
- `JIRA_USERNAME` - Jira username/email
- `JIRA_PROJECT_KEY` - Jira project key (e.g., `SEC`)

### 2. Create Workflow

Create `.github/workflows/dependabot-sync.yml`:

```yaml
name: 'Sync Dependabot to Jira'
on:
  schedule:
    - cron: '0 */6 * * *' # Every 6 hours
  workflow_dispatch: # Manual trigger

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: threemonkeysconsulting/dependabot-jira-sync-action@v1
        with:
          # GitHub App (recommended) or use github-token instead
          github-app-id: ${{ secrets.DEPENDABOT_APP_ID }}
          github-app-private-key: ${{ secrets.DEPENDABOT_APP_PRIVATE_KEY }}
          github-app-installation-id:
            ${{ secrets.DEPENDABOT_APP_INSTALLATION_ID }}

          # Jira config
          jira-url: ${{ secrets.JIRA_URL || vars.JIRA_URL }}
          jira-username: ${{ secrets.JIRA_USERNAME || vars.JIRA_USERNAME }}
          jira-api-token: ${{ secrets.JIRA_API_TOKEN }}
          jira-project-key:
            ${{ secrets.JIRA_PROJECT_KEY || vars.JIRA_PROJECT_KEY }}

          # Due dates (days from alert creation)
          critical-due-days: '1'
          high-due-days: '7'
          medium-due-days: '30'
          low-due-days: '90'
```

That's it! The action will automatically create Jira issues for Dependabot
alerts.

> **💡 Tip**: Test first with `dry-run: 'true'` to see what would happen without
> making changes.

### Advanced Example

For more control, customize issue types, priorities, and filtering:

```yaml
- uses: threemonkeysconsulting/dependabot-jira-sync-action@v1
  with:
    # ... basic config from above ...

    # Customize Jira issue
    jira-issue-type: 'Security Vulnerability'
    jira-priority: 'High' # Optional - omitted if project doesn't support it
    jira-labels: 'dependabot,security,auto-created'
    jira-assignee: 'security-team'

    # Filtering
    severity-threshold: 'medium' # Only medium+ severity
    exclude-dismissed: 'true' # Skip dismissed alerts

    # Auto-close resolved issues
    auto-close-resolved: 'true'
    close-transition: 'Done'
```

## 📋 Inputs

### Required Inputs

| Input              | Description            | Example                         |
| ------------------ | ---------------------- | ------------------------------- |
| `jira-url`         | Jira instance URL      | `https://company.atlassian.net` |
| `jira-username`    | Jira username or email | `security@company.com`          |
| `jira-api-token`   | Jira API token         | `${{ secrets.JIRA_API_TOKEN }}` |
| `jira-project-key` | Jira project key       | `SEC`                           |

### GitHub Authentication (Choose ONE method)

**GitHub App Authentication (Recommended):**

| Input                        | Description                                   | Default | Required |
| ---------------------------- | --------------------------------------------- | ------- | -------- |
| `github-app-id`              | GitHub App ID for authentication              | _none_  | ❌       |
| `github-app-private-key`     | GitHub App private key for authentication     | _none_  | ❌       |
| `github-app-installation-id` | GitHub App installation ID for authentication | _none_  | ❌       |

**Personal Access Token (Alternative):**

| Input          | Description                 | Default               | Required |
| -------------- | --------------------------- | --------------------- | -------- |
| `github-token` | GitHub token for API access | `${{ github.token }}` | ❌       |

### Jira Configuration

| Input             | Description            | Default               | Required |
| ----------------- | ---------------------- | --------------------- | -------- |
| `jira-issue-type` | Jira issue type        | `Bug`                 | ❌       |
| `jira-priority`   | Default Jira priority  | `Medium`              | ❌       |
| `jira-labels`     | Comma-separated labels | `dependabot,security` | ❌       |
| `jira-assignee`   | Default assignee       | _none_                | ❌       |

### Severity-Based Due Dates

**⚠️ Important**: Due dates are calculated from when the Dependabot alert was
**originally created**, not from when the action runs. This ensures existing
vulnerabilities maintain proper urgency.

| Input               | Description                                            | Default | Required |
| ------------------- | ------------------------------------------------------ | ------- | -------- |
| `critical-due-days` | Days from alert creation until due for critical issues | `1`     | ❌       |
| `high-due-days`     | Days from alert creation until due for high severity   | `7`     | ❌       |
| `medium-due-days`   | Days from alert creation until due for medium severity | `30`    | ❌       |
| `low-due-days`      | Days from alert creation until due for low severity    | `90`    | ❌       |

### Filter Configuration

| Input                | Description                 | Default  | Required |
| -------------------- | --------------------------- | -------- | -------- |
| `severity-threshold` | Minimum severity to process | `medium` | ❌       |
| `exclude-dismissed`  | Skip dismissed alerts       | `true`   | ❌       |

### Behavior Configuration

| Input                 | Description                                     | Default                                                                                          | Required |
| --------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------- |
| `update-existing`     | Update existing Jira issues                     | `true`                                                                                           | ❌       |
| `auto-close-resolved` | Auto-close Jira issues when alerts are resolved | `true`                                                                                           | ❌       |
| `close-transition`    | Jira transition name to close issues            | `Done`                                                                                           | ❌       |
| `close-comment`       | Comment to add when auto-closing issues         | `This issue has been automatically closed because the associated Dependabot alert was resolved.` | ❌       |
| `dry-run`             | Only log what would be done                     | `false`                                                                                          | ❌       |

## 📤 Outputs

| Output             | Description                           | Example                                                                        |
| ------------------ | ------------------------------------- | ------------------------------------------------------------------------------ |
| `issues-created`   | Number of new Jira issues created     | `3`                                                                            |
| `issues-updated`   | Number of existing issues updated     | `1`                                                                            |
| `issues-closed`    | Number of issues closed automatically | `2`                                                                            |
| `alerts-processed` | Total alerts processed                | `4`                                                                            |
| `summary`          | Summary of the operation              | `Created 3 new issues, updated 1 existing issue, and closed 2 resolved issues` |

## 🔧 Setup Requirements

### Configuration Options

You have **three ways** to configure the action (in order of precedence):

1. **🔐 Secrets** (Recommended for sensitive data):
   `Settings → Secrets → Actions`
2. **📋 Variables** (Good for non-sensitive config):
   `Settings → Secrets → Variables`
3. **🔄 Workflow env** (For dynamic values): Set in workflow file

**Example Priority**:
`${{ secrets.JIRA_URL || vars.JIRA_URL || 'fallback-value' }}`

| Setting            | Secrets | Variables | Notes                               |
| ------------------ | ------- | --------- | ----------------------------------- |
| `JIRA_URL`         | ✅      | ✅        | Usually not sensitive               |
| `JIRA_USERNAME`    | ✅      | ✅        | Email address, can be public        |
| `JIRA_API_TOKEN`   | ✅      | ❌        | **Always use secrets** - sensitive! |
| `JIRA_PROJECT_KEY` | ✅      | ✅        | Project code, usually not sensitive |

### GitHub Authentication

**Choose ONE of the following authentication methods:**

#### Option A: GitHub App (⭐ Recommended)

1. **Create GitHub App:**
   - Settings → Developer settings → GitHub Apps → New GitHub App
   - Permissions: Security events (Read), Contents (Read), Metadata (Read)
   - Disable webhooks

2. **Install on repositories:**
   - App settings → Install App → Select repositories

3. **Add secrets:**
   - `DEPENDABOT_APP_ID` - App ID
   - `DEPENDABOT_APP_PRIVATE_KEY` - Private key (.pem file content)
   - `DEPENDABOT_APP_INSTALLATION_ID` - Installation ID from URL

**Why GitHub App?** Fine-grained permissions, organization-owned, auto-rotating
tokens, better for enterprise.

#### Option B: Personal Access Token

1. Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token with scopes: `security_events`, `repo`
3. Add as `DEPENDABOT_PAT` secret

> **Note**: Default `GITHUB_TOKEN` has limited Dependabot access. Use GitHub App
> or PAT.

### Jira Permissions

Ensure your Jira user has permissions to:

- Create issues in the target project
- Search issues in the project
- Add comments to issues

## 📝 Example Jira Issue

The action creates comprehensive Jira issues with all relevant security
information:

```
Summary: Dependabot Alert #42: Critical vulnerability in lodash

Description:
*Dependabot Security Alert #42*

*Package:* lodash
*Ecosystem:* npm
*Severity:* CRITICAL
*Vulnerable Version Range:* < 4.17.12
*First Patched Version:* 4.17.12

*Description:*
Versions of lodash before 4.17.12 are vulnerable to Prototype Pollution.
The function defaultsDeep could be tricked into adding or modifying
properties of Object.prototype using a constructor payload.

*CVSS Score:* 9.8
*CVE ID:* CVE-2019-10744
*GHSA ID:* GHSA-jf85-cpcp-j695

*GitHub Alert URL:* https://github.com/company/repo/security/dependabot/42

---
_This issue was automatically created by the Dependabot Jira Sync action._

Due Date: 2024-01-16 (Critical severity = 1 day from alert creation)
Labels: dependabot, security
Priority: High
```

## 🔍 Dry Run Mode

Test the action without making changes:

```yaml
- name: Test Dependabot Sync
  uses: threemonkeysconsulting/dependabot-jira-sync-action@v1
  with:
    jira-url: 'https://company.atlassian.net'
    jira-username: 'test@company.com'
    jira-api-token: ${{ secrets.JIRA_API_TOKEN }}
    jira-project-key: 'TEST'
    dry-run: 'true' # 🧪 No actual changes will be made
```

## 🎯 Auto-Close Functionality

The action can automatically close Jira issues when the corresponding Dependabot
alerts are resolved in GitHub. This ensures your Jira board stays clean and
up-to-date.

### How It Works

1. **After processing new alerts**, the action searches for existing open Jira
   issues labeled with "dependabot"
2. **Extracts alert IDs** from issue titles (e.g., "Dependabot Alert #42") or
   descriptions
3. **Checks GitHub** to verify the current status of each alert
4. **Automatically closes** Jira issues where alerts are:
   - ✅ **Fixed** (patched by a dependency update)
   - ✅ **Dismissed** (manually dismissed in GitHub)
   - ✅ **Not Found** (alert was deleted)

### Configuration

```yaml
auto-close-resolved: 'true'
close-transition: 'Done' # Your Jira workflow transition
close-comment: 'Alert was automatically resolved in GitHub'
```

### Example Log Output

```
🔄 Checking for resolved alerts to auto-close...
🔍 Found 3 open Dependabot issues in Jira
✅ Alert #42 is fixed - closing issue SEC-123
ℹ️  Alert #43 is still open - keeping issue SEC-124 open
❌ Alert #44 not found - closing issue SEC-125
📊 Auto-closed 2 resolved issues
```

## 📊 Monitoring & Observability

The action provides detailed logging:

```
✅ Starting Dependabot Jira Sync...
📍 Repository: company/awesome-app
🔍 Fetching Dependabot alerts for company/awesome-app
📋 Found 5 total alerts
🎯 3 alerts match severity threshold: medium
🔄 Processing alert #42: Critical vulnerability in lodash
✅ Created Jira issue TEST-123 for alert #42
🔄 Processing alert #43: High severity issue in axios
ℹ️  Found existing issue: TEST-100
✅ Updated Jira issue: TEST-100

🔄 Checking for resolved alerts to auto-close...
🔍 Found 2 open Dependabot issues
✅ Alert #39 is fixed - closing issue TEST-95
ℹ️  Alert #40 is still open - keeping issue TEST-98 open

📊 Summary:
- Alerts processed: 3
- Issues created: 1
- Issues updated: 1
- Issues closed: 1
✅ Dependabot Jira Sync completed successfully
```

## 🚨 Troubleshooting

### Common Issues

**Permission Errors:**

- Ensure GitHub App/PAT has `security_events` scope
- Verify Jira user has permission to create issues in the target project
- Check that the Jira project key exists and is accessible

**Rate Limiting:**

- Jira Cloud: 20 requests/second, 5000 requests/hour per IP
- GitHub: 5000 requests/hour for authenticated requests
- Consider reducing sync frequency for large repositories

**Authentication Failures:**

- GitHub App: Verify app is installed on the repository
- Jira: Ensure API token belongs to the specified username
- Test credentials with `dry-run: true` first

### Performance Considerations

For large repositories (>100 alerts):

- Use specific `severity-threshold` to reduce processing
- Consider running less frequently (daily vs. hourly)
- Enable `exclude-dismissed: true` to skip resolved issues

### Debug Mode

Enable verbose logging by setting the repository secret:

```
ACTIONS_STEP_DEBUG = true
```

## 🛠️ Development

### Local Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Run tests: `npm test`
4. Build: `npm run package`
5. Format code: `npm run format:write`
6. Run linting: `npm run lint`

### Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run coverage

# Run all checks (format, lint, test, build)
npm run all
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file
for details.

## 🙏 Acknowledgments

- Built on the
  [GitHub Actions JavaScript template](https://github.com/actions/javascript-action)
- Inspired by existing Dependabot-Jira integrations
- Powered by the GitHub REST API and Jira REST API

---

**Need help?**
[Open an issue](https://github.com/threemonkeysconsulting/dependabot-jira-sync-action/issues)
or check out the
[GitHub Actions documentation](https://docs.github.com/en/actions).
