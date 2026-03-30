# Performance Optimization & Troubleshooting Guide

## Performance Optimization

### 1. Dependency Caching

**Problem:** Installing dependencies on every run wastes time and money.

**Solution:** Cache dependencies

```yaml
# Node.js with actions/setup-node (built-in caching)
- uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'  # or 'yarn', 'pnpm'

# Manual caching for more control
- uses: actions/cache@v4
  with:
    path: |
      ~/.npm
      node_modules
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-
```

**Impact:** 50-80% faster dependency installation

**Best practices:**
- Include lockfile hash in cache key
- Use restore-keys for partial matches
- Cache node_modules and package manager cache
- Update cache when dependencies change

### 2. Concurrency Control

**Problem:** Multiple workflow runs for the same branch waste resources.

**Solution:** Cancel stale runs

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

**Impact:** Saves CI minutes, faster feedback

**Use cases:**
- PR workflows: Cancel old runs when new commits pushed
- CI testing: Only test latest commit
- **Don't use for:** Deployments (can cause partial deploys)

### 3. Path Filtering

**Problem:** Workflows run even when irrelevant files change.

**Solution:** Filter by paths

```yaml
on:
  push:
    paths:
      - 'src/**'
      - 'package.json'
    paths-ignore:
      - '**.md'
      - 'docs/**'
```

**Impact:** Reduce unnecessary workflow runs by 30-50%

**Tips:**
- Be specific about relevant paths
- Use paths-ignore for documentation
- Combine with branch filters

### 4. Job Parallelization

**Problem:** Sequential jobs slow down pipeline.

**Solution:** Run independent jobs in parallel

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps: [...]

  test:
    runs-on: ubuntu-latest  # Runs in parallel with lint
    steps: [...]

  build:
    needs: [lint, test]  # Waits for both
    runs-on: ubuntu-latest
    steps: [...]
```

**Impact:** 40-60% faster pipelines

**Matrix parallelization:**
```yaml
strategy:
  matrix:
    shard: [1, 2, 3, 4]  # Split tests across 4 runners
steps:
  - run: npm test -- --shard=${{ matrix.shard }}/4
```

### 5. Efficient Artifact Usage

**Problem:** Large artifacts slow uploads/downloads.

**Solution:** Optimize artifact usage

```yaml
# Only upload what's needed
- uses: actions/upload-artifact@v4
  with:
    name: build
    path: dist/  # Not entire working directory
    retention-days: 7  # Don't keep forever

# Exclude unnecessary files
- uses: actions/upload-artifact@v4
  with:
    name: build
    path: |
      dist/**
      !dist/**/*.map  # Exclude source maps
```

**Impact:** Faster uploads/downloads, reduced storage costs

### 6. Docker Build Caching

**Problem:** Rebuilding Docker images from scratch is slow.

**Solution:** Use build cache

```yaml
- uses: docker/build-push-action@v5
  with:
    context: .
    push: true
    tags: ${{ env.IMAGE }}:latest
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

**Impact:** 60-80% faster Docker builds

**Additional optimizations:**
```dockerfile
# In Dockerfile: Order layers by change frequency
FROM node:20
WORKDIR /app
COPY package*.json ./  # Changes less frequently
RUN npm ci
COPY . .  # Changes more frequently
RUN npm run build
```

### 7. Reduce Checkout Depth

**Problem:** Cloning entire git history takes time.

**Solution:** Shallow clone

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 1  # Only latest commit
```

**Impact:** Faster checkout, especially for large repos

**When to use full history:**
- Release notes generation
- Semantic versioning
- Code coverage diffs

### 8. Optimize Test Execution

**Strategies:**
```yaml
# 1. Run fast tests first
- run: npm run test:unit  # Fast
- run: npm run test:integration  # Slower
- run: npm run test:e2e  # Slowest

# 2. Fail fast in matrix
strategy:
  fail-fast: true  # Stop on first failure

# 3. Split by timing
- run: npm test -- --only-changed  # Jest

# 4. Parallel execution
- run: npm test -- --maxWorkers=4
```

### 9. Smaller Runners for Simple Tasks

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest  # 2 cores, cheaper
    steps:
      - run: npm run lint

  build:
    runs-on: ubuntu-latest-4-cores  # More expensive
    steps:
      - run: npm run build  # Needs more power
```

### 10. Workflow Run Time Best Practices

```yaml
# Set timeouts to prevent runaway jobs
jobs:
  test:
    timeout-minutes: 10  # Kill after 10 minutes

# Use if conditions to skip unnecessary work
- name: Deploy
  if: github.ref == 'refs/heads/main'
  run: ./deploy.sh

# Combine independent commands
- run: npm ci && npm test && npm run build
```

---

## Troubleshooting Guide

### Common Errors and Solutions

#### 1. "Resource not accessible by integration"

**Cause:** Insufficient permissions

**Solution:**
```yaml
permissions:
  contents: write  # Add missing permission
  pull-requests: write
```

#### 2. "fatal: could not read Username for 'https://github.com'"

**Cause:** Missing git credentials

**Solution:**
```yaml
- uses: actions/checkout@v4
  with:
    token: ${{ secrets.GITHUB_TOKEN }}  # Use token
```

#### 3. Cache not being restored

**Cause:** Cache key doesn't match

**Debug:**
```yaml
- uses: actions/cache@v4
  id: cache
  with:
    path: node_modules
    key: ${{ runner.os }}-${{ hashFiles('**/package-lock.json') }}

- run: echo "Cache hit: ${{ steps.cache.outputs.cache-hit }}"
```

**Common issues:**
- Lockfile not committed
- Path doesn't exist
- Cache key includes variables that change

#### 4. "Error: No space left on device"

**Cause:** Runner disk space exhausted

**Solution:**
```yaml
- name: Free up disk space
  run: |
    sudo rm -rf /usr/share/dotnet
    sudo rm -rf /opt/ghc
    sudo rm -rf /usr/local/share/boost
    sudo apt-get clean
```

#### 5. Secrets not available

**Cause:** Workflows from forks don't have access to secrets

**Solution:**
```yaml
# Use pull_request_target carefully
on:
  pull_request_target:  # Has access to secrets
    types: [labeled]  # Require label for security

jobs:
  deploy:
    if: contains(github.event.pull_request.labels.*.name, 'safe-to-deploy')
    steps: [...]
```

#### 6. "Resource protected by organization rule"

**Cause:** Organization security policies block action

**Solution:**
- Contact organization admin
- Use approved actions only
- Request exception for action

#### 7. Workflow not triggering

**Common causes:**

```yaml
# 1. Wrong event type
on: [pull_request]  # Triggers on PR open, NOT on push

# 2. Branch filter mismatch
on:
  push:
    branches: [master]  # Repo uses 'main'

# 3. Path filter excluding all changes
on:
  push:
    paths:
      - 'src/**'  # Changed files in 'app/**'

# 4. Workflow disabled
# Check: Settings → Actions → Disabled workflows
```

#### 8. Job skipped unexpectedly

**Cause:** Condition evaluated to false

**Debug:**
```yaml
- name: Debug context
  run: |
    echo "Ref: ${{ github.ref }}"
    echo "Event: ${{ github.event_name }}"
    echo "Actor: ${{ github.actor }}"

# Check your if conditions:
if: github.ref == 'refs/heads/main'  # Case sensitive!
```

#### 9. Container failed to start

**Causes:**
```yaml
# 1. Wrong image
services:
  db:
    image: postgres:999  # Version doesn't exist

# 2. Missing environment variables
services:
  db:
    image: postgres:16
    # Missing POSTGRES_PASSWORD

# 3. Port conflict
services:
  db:
    ports:
      - 5432:5432  # Port already in use
```

**Solution:**
```yaml
services:
  db:
    image: postgres:16
    env:
      POSTGRES_PASSWORD: postgres
    ports:
      - 5433:5432  # Use different host port
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
```

#### 10. Action version not found

**Error:** `Unable to resolve action 'actions/checkout@v999'`

**Causes:**
- Typo in version
- Version doesn't exist
- Using SHA that doesn't exist

**Solution:**
- Check action releases on GitHub
- Use valid version: `@v4`, `@v4.1.1`, or SHA

### Debugging Techniques

#### 1. Enable debug logging

```bash
# Set repository secrets:
# ACTIONS_RUNNER_DEBUG = true
# ACTIONS_STEP_DEBUG = true
```

#### 2. Print context information

```yaml
- name: Dump GitHub context
  run: echo '${{ toJSON(github) }}'

- name: Dump runner context
  run: echo '${{ toJSON(runner) }}'

- name: Dump job context
  run: echo '${{ toJSON(job) }}'
```

#### 3. Use tmate for interactive debugging

```yaml
- name: Setup tmate session
  if: failure()
  uses: mxschmitt/action-tmate@v3
  timeout-minutes: 30
```

#### 4. Check file contents

```yaml
- name: Debug files
  run: |
    ls -la
    cat package.json
    env | sort
```

#### 5. Test expressions

```yaml
- name: Test condition
  if: always()
  run: |
    echo "Ref: ${{ github.ref }}"
    echo "Expected: refs/heads/main"
    echo "Match: ${{ github.ref == 'refs/heads/main' }}"
```

### Performance Profiling

#### Identify slow steps

```yaml
- name: Profile build
  run: |
    START=$(date +%s)
    npm run build
    END=$(date +%s)
    echo "Build took $((END - START)) seconds"
```

#### Measure cache effectiveness

```yaml
- uses: actions/cache@v4
  id: cache
  with:
    path: node_modules
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}

- name: Cache stats
  run: |
    echo "Cache hit: ${{ steps.cache.outputs.cache-hit }}"
    echo "Cache key: ${{ steps.cache.outputs.cache-matched-key }}"
```

#### Monitor runner performance

```yaml
- name: System info
  run: |
    echo "CPU cores: $(nproc)"
    echo "Memory: $(free -h)"
    echo "Disk: $(df -h)"
    top -bn1 | head -20
```

### Getting Help

1. **GitHub Actions Community:**
   - https://github.community/c/code-to-cloud/github-actions/

2. **Documentation:**
   - https://docs.github.com/en/actions

3. **Status Page:**
   - https://www.githubstatus.com/

4. **Workflow Syntax:**
   - Use VS Code extension for syntax validation
   - GitHub Actions YAML schemas

5. **Action Marketplace:**
   - https://github.com/marketplace?type=actions
   - Check issues/discussions for known problems

### Cost Optimization

#### Monitor usage

```bash
# Check minutes usage:
# Settings → Billing → Actions minutes
```

#### Reduce costs

1. **Use smaller runners:** ubuntu-latest vs larger runners
2. **Optimize build times:** caching, parallelization
3. **Cancel redundant runs:** concurrency groups
4. **Limit workflows:** path filters, branch filters
5. **Self-hosted runners:** for private repos (carefully)
6. **Matrix optimization:** exclude unnecessary combinations
7. **Artifact cleanup:** short retention periods
8. **Conditional jobs:** skip when not needed

```yaml
# Example: Skip expensive tests on docs changes
jobs:
  e2e-tests:
    if: "!contains(github.event.head_commit.message, '[skip e2e]')"
    runs-on: ubuntu-latest
    steps: [...]
```
