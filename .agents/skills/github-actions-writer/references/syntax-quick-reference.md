# GitHub Actions Syntax Quick Reference

A comprehensive quick reference for GitHub Actions workflow syntax.

## Workflow Structure

```yaml
name: Workflow Name                    # Display name (optional)
run-name: Custom run title            # Dynamic run name (optional)

on: <triggers>                         # Required: when to run

permissions: <permissions>             # Security: limit token permissions

env: <environment-variables>           # Global environment variables

defaults: <defaults>                   # Default settings for all jobs

concurrency: <concurrency-group>       # Prevent concurrent runs

jobs:                                  # Required: jobs to execute
  job-id:
    <job-configuration>
```

## Triggers (on)

### Push Events

```yaml
on:
  push:
    branches:
      - main
      - 'feature/**'              # Wildcards supported
      - '!skip-ci/**'             # Exclude with !
    tags:
      - 'v*.*.*'                  # Semantic versioning
    paths:
      - 'src/**'                  # Only these paths
      - '!docs/**'                # Exclude paths
    paths-ignore:                 # Alternative to !paths
      - '**.md'
```

### Pull Request Events

```yaml
on:
  pull_request:
    types:                        # Default: [opened, synchronize, reopened]
      - opened
      - synchronize
      - reopened
      - closed
      - labeled
      - unlabeled
      - assigned
      - review_requested
    branches:
      - main
    paths:
      - 'src/**'
```

### Schedule (Cron)

```yaml
on:
  schedule:
    - cron: '0 0 * * *'           # Daily at midnight UTC
    - cron: '0 */6 * * *'         # Every 6 hours
    - cron: '0 0 * * 0'           # Weekly on Sunday
```

Cron format: `minute hour day month weekday`
- Use https://crontab.guru for testing

### Manual Trigger (workflow_dispatch)

```yaml
on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to deploy'
        required: true
        type: choice
        options:
          - staging
          - production
        default: 'staging'

      version:
        description: 'Version to deploy'
        required: false
        type: string

      debug:
        description: 'Enable debug mode'
        required: false
        type: boolean
        default: false
```

### Multiple Triggers

```yaml
on: [push, pull_request, workflow_dispatch]

# OR with detailed configuration:
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:
```

## Permissions

```yaml
permissions:
  contents: read                  # Repository contents
  pull-requests: write            # PRs and comments
  issues: write                   # Issues
  packages: write                 # GitHub Packages
  id-token: write                 # OIDC token
  deployments: write              # Deployments
  security-events: write          # Security alerts
  actions: read                   # Actions

# OR grant all (not recommended):
permissions: write-all

# OR deny all:
permissions: read-all  # or: {}
```

## Concurrency

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true        # Cancel old runs
```

Common patterns:
```yaml
# Per branch:
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

# Per PR:
concurrency:
  group: pr-${{ github.event.pull_request.number }}
  cancel-in-progress: true

# Never cancel (deployments):
concurrency:
  group: deploy-production
  cancel-in-progress: false
```

## Environment Variables

```yaml
# Global:
env:
  NODE_ENV: production
  API_URL: https://api.example.com

jobs:
  build:
    # Job-level:
    env:
      BUILD_TYPE: release

    steps:
      # Step-level:
      - name: Build
        env:
          SPECIFIC_VAR: value
        run: npm run build
```

## Jobs

### Basic Job

```yaml
jobs:
  job-id:
    name: Display Name
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4
      - run: echo "Hello World"
```

### Runner Selection

```yaml
runs-on: ubuntu-latest            # Ubuntu (recommended)
runs-on: windows-latest           # Windows
runs-on: macos-latest             # macOS
runs-on: ubuntu-22.04             # Specific version
runs-on: [self-hosted, linux]     # Self-hosted with labels

# Matrix runner:
runs-on: ${{ matrix.os }}
```

### Job Dependencies

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps: [...]

  test:
    needs: build                  # Wait for build
    runs-on: ubuntu-latest
    steps: [...]

  deploy:
    needs: [build, test]          # Wait for multiple
    runs-on: ubuntu-latest
    steps: [...]
```

### Conditional Jobs

```yaml
jobs:
  deploy:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps: [...]
```

### Job Outputs

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.version.outputs.version }}
      artifact-id: ${{ steps.upload.outputs.artifact-id }}
    steps:
      - id: version
        run: echo "version=1.0.0" >> $GITHUB_OUTPUT
      - id: upload
        uses: actions/upload-artifact@v4
        with: {name: build, path: dist/}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - run: echo "Version: ${{ needs.build.outputs.version }}"
```

## Matrix Strategy

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, windows-latest, macos-latest]
    node-version: [18, 20, 22]
    include:                      # Add combinations
      - os: ubuntu-latest
        node-version: 22
        experimental: true
    exclude:                      # Remove combinations
      - os: macos-latest
        node-version: 18
  fail-fast: false                # Continue on failure
  max-parallel: 2                 # Limit concurrent jobs

steps:
  - uses: actions/setup-node@v4
    with:
      node-version: ${{ matrix.node-version }}
```

## Steps

### Using Actions

```yaml
- name: Checkout code
  uses: actions/checkout@v4
  with:
    fetch-depth: 0
    ref: main

- uses: actions/setup-node@v4     # Compact form
  with:
    node-version: '20'
    cache: 'npm'
```

### Running Commands

```yaml
- name: Single command
  run: npm install

- name: Multiple commands
  run: |
    npm ci
    npm test
    npm run build

- name: With shell selection
  shell: bash
  run: echo "Hello"

# Available shells: bash, pwsh, python, sh, cmd, powershell
```

### Step Conditions

```yaml
- name: Only on main
  if: github.ref == 'refs/heads/main'
  run: npm publish

- name: Only on success
  if: success()
  run: echo "Previous steps succeeded"

- name: Only on failure
  if: failure()
  run: echo "Something failed"

- name: Always run
  if: always()
  run: echo "Cleanup"

- name: When cancelled
  if: cancelled()
  run: echo "Workflow was cancelled"
```

### Step Outputs

```yaml
- name: Set output
  id: my-step
  run: echo "result=success" >> $GITHUB_OUTPUT

- name: Use output
  run: echo "Result was ${{ steps.my-step.outputs.result }}"
```

### Continue on Error

```yaml
- name: May fail
  continue-on-error: true
  run: npm audit

- name: May fail (conditional)
  continue-on-error: ${{ matrix.experimental == true }}
  run: npm test
```

## Expressions and Functions

### Contexts

```yaml
${{ github.sha }}                 # Commit SHA
${{ github.ref }}                 # Ref (refs/heads/main)
${{ github.ref_name }}            # Branch name (main)
${{ github.repository }}          # owner/repo
${{ github.actor }}               # User who triggered
${{ github.event_name }}          # Event type (push, pull_request)
${{ github.workspace }}           # Working directory
${{ runner.os }}                  # OS (Linux, Windows, macOS)
${{ secrets.SECRET_NAME }}        # Secret value
${{ vars.VARIABLE_NAME }}         # Repository variable
${{ env.ENV_VAR }}               # Environment variable
${{ steps.step-id.outputs.name }} # Step output
${{ needs.job-id.outputs.name }}  # Job output
```

### Functions

```yaml
# Logical:
if: success()                     # Previous steps succeeded
if: failure()                     # Any previous step failed
if: always()                      # Always run
if: cancelled()                   # Workflow cancelled

# Comparison:
if: github.ref == 'refs/heads/main'
if: contains(github.event.head_commit.message, '[skip ci]')
if: startsWith(github.ref, 'refs/tags/v')
if: endsWith(github.ref, '-beta')

# Type conversions:
${{ fromJSON(steps.data.outputs.json) }}
${{ toJSON(github.event) }}

# File operations:
if: hashFiles('**/package-lock.json') != ''

# Logical operators:
if: github.ref == 'refs/heads/main' && success()
if: github.event_name == 'push' || github.event_name == 'workflow_dispatch'
if: !cancelled()
```

## Services (Containers)

```yaml
jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - run: psql -h localhost -U postgres
```

## Artifacts

```yaml
# Upload:
- uses: actions/upload-artifact@v4
  with:
    name: build-output
    path: |
      dist/
      build/
    retention-days: 7
    if-no-files-found: error       # error, warn, ignore

# Download:
- uses: actions/download-artifact@v4
  with:
    name: build-output
    path: ./dist
```

## Caching

```yaml
- uses: actions/cache@v4
  with:
    path: |
      ~/.npm
      node_modules
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-
```

## Environments

```yaml
jobs:
  deploy:
    environment:
      name: production
      url: https://example.com
    runs-on: ubuntu-latest
    steps: [...]
```

## Reusable Workflows

```yaml
# Caller:
jobs:
  call-workflow:
    uses: ./.github/workflows/reusable.yml
    with:
      environment: production
    secrets:
      token: ${{ secrets.TOKEN }}

# Reusable:
on:
  workflow_call:
    inputs:
      environment:
        required: true
        type: string
    secrets:
      token:
        required: true
    outputs:
      result:
        value: ${{ jobs.build.outputs.result }}
```

## Common Patterns

### Checkout with submodules:
```yaml
- uses: actions/checkout@v4
  with:
    submodules: recursive
```

### Multi-line strings:
```yaml
- run: |
    echo "Line 1"
    echo "Line 2"
```

### Environment-specific config:
```yaml
- name: Set environment
  run: |
    if [ "${{ github.ref }}" = "refs/heads/main" ]; then
      echo "ENV=production" >> $GITHUB_ENV
    else
      echo "ENV=staging" >> $GITHUB_ENV
    fi
```

### Skip CI:
```yaml
if: "!contains(github.event.head_commit.message, '[skip ci]')"
```

## Tips

1. Use single quotes for literal strings, double quotes when interpolating
2. Expressions don't need quotes when used as entire value
3. Always set `timeout-minutes` to prevent hung jobs
4. Use `fail-fast: false` in matrix for complete test results
5. Pin action versions with SHA for security
6. Use `concurrency` to save CI minutes
7. Cache dependencies for faster builds
8. Set minimal `permissions` for security
