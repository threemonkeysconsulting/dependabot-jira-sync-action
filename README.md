# Dependabot Jira Sync Action

![GitHub Super-Linter](https://github.com/yourusername/dependabot-jira-sync-action/actions/workflows/linter.yml/badge.svg)
![CI](https://github.com/yourusername/dependabot-jira-sync-action/actions/workflows/ci.yml/badge.svg)
![Code Coverage](./badges/coverage.svg)

A GitHub Action that automatically syncs Dependabot security alerts to Jira
issues with **configurable due dates based on severity levels**.

## ✨ Features

- 🛡️ **Automatic Security Alert Sync**: Fetches Dependabot alerts and creates
  corresponding Jira issues
- ⏰ **Severity-Based Due Dates**: Configure different due dates for critical,
  high, medium, and low severity alerts
- 🔄 **Smart Updates**: Updates existing Jira issues when alerts change or are
  dismissed
- 🧪 **Dry Run Mode**: Test the action without making actual changes
- 🎯 **Flexible Filtering**: Filter by severity threshold and dismissed status
- 📝 **Rich Issue Details**: Includes vulnerability details, CVSS scores, CVE
  IDs, and GitHub links
- 🔧 **Highly Configurable**: Customize Jira project, issue types, priorities,
  labels, and assignments

## 🚀 Quick Start

### Basic Usage

```yaml
name: 'Dependabot Jira Sync'
on:
  schedule:
    # Run every 6 hours
    - cron: '0 */6 * * *'
  workflow_dispatch: # Allow manual trigger

jobs:
  sync-dependabot-alerts:
    runs-on: ubuntu-latest
    steps:
      - name: Sync Dependabot Alerts to Jira
        uses: yourusername/dependabot-jira-sync-action@v1
        with:
          # GitHub Authentication - Choose ONE method:

          # Option 1: Personal Access Token (PAT)
          github-token: ${{ secrets.DEPENDABOT_PAT }}

          # Option 2: GitHub App (Alternative to PAT)
          # github-app-id: ${{ secrets.DEPENDABOT_APP_ID }}
          # github-app-private-key: ${{ secrets.DEPENDABOT_APP_PRIVATE_KEY }}
          # github-app-installation-id: ${{ secrets.DEPENDABOT_APP_INSTALLATION_ID }}

          # Jira Configuration
          jira-url: 'https://yourcompany.atlassian.net'
          jira-username: 'your-email@company.com'
          jira-api-token: ${{ secrets.JIRA_API_TOKEN }}
          jira-project-key: 'SEC'

          # Severity-based due dates (in days)
          critical-due-days: '1' # Critical issues due in 1 day
          high-due-days: '3' # High issues due in 3 days
          medium-due-days: '14' # Medium issues due in 2 weeks
          low-due-days: '30' # Low issues due in 1 month
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Advanced Configuration

```yaml
name: 'Advanced Dependabot Jira Sync'
on:
  schedule:
    - cron: '0 8,14,20 * * *' # Run 3 times daily
  workflow_dispatch:

jobs:
  sync-alerts:
    runs-on: ubuntu-latest
    steps:
      - name: Sync Critical and High Severity Alerts
        uses: yourusername/dependabot-jira-sync-action@v1
        with:
          # GitHub Configuration
          github-token: ${{ secrets.PAT_TOKEN }} # Use PAT for better rate limits

          # Jira Configuration
          jira-url: ${{ secrets.JIRA_URL }}
          jira-username: ${{ secrets.JIRA_USERNAME }}
          jira-api-token: ${{ secrets.JIRA_API_TOKEN }}
          jira-project-key: 'SECURITY'
          jira-issue-type: 'Security Vulnerability'
          jira-priority: 'High'
          jira-labels: 'dependabot,security,auto-created'
          jira-assignee: 'security-team-lead'

          # Due Date Configuration (days from creation)
          critical-due-days: '1' # Same day fix required
          high-due-days: '7' # 1 week to fix
          medium-due-days: '30' # 1 month to fix
          low-due-days: '90' # 3 months to fix

          # Filter Configuration
          severity-threshold: 'medium' # Only process medium+ severity
          exclude-dismissed: 'true' # Skip dismissed alerts

          # Behavior Configuration
          update-existing: 'true' # Update existing issues
          dry-run: 'false' # Make actual changes
```

## 📋 Inputs

### Required Inputs

| Input              | Description            | Example                         |
| ------------------ | ---------------------- | ------------------------------- |
| `jira-url`         | Jira instance URL      | `https://company.atlassian.net` |
| `jira-username`    | Jira username or email | `security@company.com`          |
| `jira-api-token`   | Jira API token         | `${{ secrets.JIRA_API_TOKEN }}` |
| `jira-project-key` | Jira project key       | `SEC`                           |

### GitHub Configuration

| Input          | Description                 | Default               | Required |
| -------------- | --------------------------- | --------------------- | -------- |
| `github-token` | GitHub token for API access | `${{ github.token }}` | ✅       |

### Jira Configuration

| Input             | Description            | Default               | Required |
| ----------------- | ---------------------- | --------------------- | -------- |
| `jira-issue-type` | Jira issue type        | `Bug`                 | ❌       |
| `jira-priority`   | Default Jira priority  | `Medium`              | ❌       |
| `jira-labels`     | Comma-separated labels | `dependabot,security` | ❌       |
| `jira-assignee`   | Default assignee       | _none_                | ❌       |

### Severity-Based Due Dates

| Input               | Description                               | Default | Required |
| ------------------- | ----------------------------------------- | ------- | -------- |
| `critical-due-days` | Days until due for critical issues        | `1`     | ❌       |
| `high-due-days`     | Days until due for high severity issues   | `7`     | ❌       |
| `medium-due-days`   | Days until due for medium severity issues | `30`    | ❌       |
| `low-due-days`      | Days until due for low severity issues    | `90`    | ❌       |

### Filter Configuration

| Input                | Description                 | Default  | Required |
| -------------------- | --------------------------- | -------- | -------- |
| `severity-threshold` | Minimum severity to process | `medium` | ❌       |
| `exclude-dismissed`  | Skip dismissed alerts       | `true`   | ❌       |

### Behavior Configuration

| Input             | Description                 | Default | Required |
| ----------------- | --------------------------- | ------- | -------- |
| `update-existing` | Update existing Jira issues | `true`  | ❌       |
| `dry-run`         | Only log what would be done | `false` | ❌       |

## 📤 Outputs

| Output             | Description                       | Example                                             |
| ------------------ | --------------------------------- | --------------------------------------------------- |
| `issues-created`   | Number of new Jira issues created | `3`                                                 |
| `issues-updated`   | Number of existing issues updated | `1`                                                 |
| `alerts-processed` | Total alerts processed            | `4`                                                 |
| `summary`          | Summary of the operation          | `Created 3 new issues and updated 1 existing issue` |

## 🔧 Setup Requirements

### 1. Jira API Token

1. Go to
   [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click "Create API token"
3. Add the token as `JIRA_API_TOKEN` in your repository secrets

### 2. GitHub Authentication

**Choose ONE of the following authentication methods:**

#### Option A: Personal Access Token (PAT) 🔑

1. Go to **Settings** → **Developer settings** → **Personal access tokens** →
   **Tokens (classic)**
2. Click **"Generate new token"**
3. Select scopes:
   - ✅ `security_events` (read security events)
   - ✅ `repo` (access repositories)
4. Add token as `DEPENDABOT_PAT` in repository secrets

#### Option B: GitHub App (Recommended for Organizations) 🏢

1. **Create GitHub App:**
   - Go to **Settings** → **Developer settings** → **GitHub Apps** → **New
     GitHub App**
   - Configure permissions:
     - ✅ Security events: Read
     - ✅ Contents: Read
     - ✅ Metadata: Read
   - Disable webhooks (not needed)

2. **Install on repositories:**
   - Go to app settings → **Install App**
   - Select repositories

3. **Add secrets:**
   - `DEPENDABOT_APP_ID`: Your app ID
   - `DEPENDABOT_APP_PRIVATE_KEY`: Your app's private key (download .pem file
     content)
   - `DEPENDABOT_APP_INSTALLATION_ID`: Installation ID from the URL

**GitHub App advantages:**

- ✅ Fine-grained permissions
- ✅ Organization-owned (not user-tied)
- ✅ Auto-rotating tokens
- ✅ Better for enterprise security

**Note:** The default `GITHUB_TOKEN` has limited access to Dependabot alerts.
You must use either a PAT or GitHub App for this action to work properly.

### 3. Jira Permissions

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

Due Date: Tomorrow (Critical severity = 1 day)
Labels: dependabot, security
Priority: High
```

## 🔍 Dry Run Mode

Test the action without making changes:

```yaml
- name: Test Dependabot Sync
  uses: yourusername/dependabot-jira-sync-action@v1
  with:
    jira-url: 'https://company.atlassian.net'
    jira-username: 'test@company.com'
    jira-api-token: ${{ secrets.JIRA_API_TOKEN }}
    jira-project-key: 'TEST'
    dry-run: 'true' # 🧪 No actual changes will be made
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

📊 Summary:
- Alerts processed: 3
- Issues created: 1
- Issues updated: 1
✅ Dependabot Jira Sync completed successfully
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
[Open an issue](https://github.com/yourusername/dependabot-jira-sync-action/issues)
or check out the
[GitHub Actions documentation](https://docs.github.com/en/actions).
