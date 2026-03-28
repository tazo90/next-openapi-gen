# Contributing to next-openapi-gen

Thank you for considering contributing to **next-openapi-gen**! 🎉

We welcome contributions from the community, whether it's:

- 🐛 Bug reports
- ✨ Feature requests
- 📝 Documentation improvements
- 🔧 Code contributions

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Pull Request Process](#pull-request-process)
- [Development Setup](#development-setup)
- [Release Process](#release-process)

---

## Code of Conduct

Please be respectful and constructive in all interactions.

---

## Getting Started

### 1. Fork and Clone

```bash
# Fork the repository on GitHub, then:
git clone https://github.com/YOUR_USERNAME/next-openapi-gen.git
cd next-openapi-gen
```

### 2. Install Dependencies

```bash
pnpm install
```

This repository uses a pnpm workspace, so running `pnpm install` at the repository root installs dependencies for the root package and all example apps.

Git hooks are installed automatically during `pnpm install` with `simple-git-hooks`.

- `pre-commit` runs `lint-staged`, which formats staged files with Oxfmt and lints staged JS/TS files with Oxlint
- `commit-msg` runs `commitlint`, which enforces Conventional Commits

### 3. Create a Branch

```bash
git checkout -b feat/my-feature
# or
git checkout -b fix/my-bugfix
```

---

## Commit Message Guidelines

We use **[Conventional Commits](https://www.conventionalcommits.org/)** format for commit messages. This helps us automatically generate changelogs and determine version bumps.

### Format

```text
<type>: <description>

[optional body]

[optional footer]
```

### Types

| Type        | Description             | Version Bump          | Example                              |
| ----------- | ----------------------- | --------------------- | ------------------------------------ |
| `feat:`     | New feature             | MINOR (0.8.0 → 0.9.0) | `feat: add Drizzle ORM support`      |
| `fix:`      | Bug fix                 | PATCH (0.8.0 → 0.8.1) | `fix: resolve type errors`           |
| `perf:`     | Performance improvement | PATCH                 | `perf: optimize schema processing`   |
| `docs:`     | Documentation only      | None                  | `docs: update README examples`       |
| `style:`    | Code formatting         | None                  | `style: fix indentation`             |
| `refactor:` | Code refactoring        | None                  | `refactor: simplify route processor` |
| `test:`     | Tests only              | None                  | `test: add unit tests for converter` |
| `build:`    | Build system changes    | None                  | `build: update tsconfig`             |
| `ci:`       | CI/CD changes           | None                  | `ci: add workflow`                   |
| `chore:`    | Maintenance tasks       | None                  | `chore: update dependencies`         |

### Breaking Changes

For breaking changes, add `!` after the type or include `BREAKING CHANGE:` in the footer:

```text
feat!: migrate to ESM modules

BREAKING CHANGE: CommonJS is no longer supported.
Node.js 16 is no longer supported, minimum version is now 18.0.0.
```

**Version bump:** MAJOR (0.8.0 → 1.0.0)

### Examples

✅ **Good commit messages**

```text
feat: add support for Drizzle ORM schemas
fix: resolve crash on dynamic routes
perf: improve OpenAPI generation speed by 40%
docs: add examples for Zod integration
refactor: simplify schema processor logic
test: add integration tests for route processor
```

❌ **Bad commit messages**

```text
added feature
fix
update
WIP
Fixed stuff
```

### Scope (Optional)

You can add a scope for more context:

```text
feat(drizzle): add support for Drizzle schemas
fix(types): resolve TypeScript errors in route processor
docs(readme): add installation instructions
```

---

## Pull Request Process

### 1. Ensure Your Code Quality

Before submitting a PR:

```bash
# Run the repo-wide format + lint checks
pnpm check

# Run dead-code and unused-dependency checks
pnpm knip

# Run tests
pnpm test

# Build the project
pnpm build

# Run the main local verification flow
pnpm verify
```

If you want to preview what the pre-commit hook will do before committing, run:

```bash
pnpm lint:staged
```

### 2. Update Documentation

- Update README.md if you added new features
- Add JSDoc comments for new functions/classes
- Update examples if needed

### 3. Create a Pull Request

**Important:** Your PR title must follow the Conventional Commits format!

#### ✅ Good PR Titles

```text
feat: add support for Drizzle ORM schemas
fix: resolve TypeScript type errors in route processor
docs: update README with new examples
```

#### ❌ Bad PR Titles

```text
Added drizzle support
Fixed bugs
Update
```

**Why?** We use **squash merge**, so your PR title becomes the commit message in the main branch.

### 4. PR Template

When you create a PR, a template will guide you through:

- Description of changes
- Type of change (bug fix, feature, etc.)
- Checklist

### 5. Review Process

- Maintainers will review your PR
- Address any feedback
- Once approved, your PR will be squashed and merged

---

## Development Setup

### Project Structure

```text
next-openapi-gen/
├── apps/                     # Example Next.js apps
│   ├── next-app-zod/
│   └── types/                # Shared ambient typings for examples
├── packages/
│   ├── next-openapi-gen/
│   │   ├── src/              # CLI source
│   │   └── dist/             # CLI build output (ignored)
│   ├── next-config/          # Shared Next.js config for example apps
│   ├── oxfmt-config/
│   ├── oxlint-config/
│   └── typescript-config/
├── tests/
│   ├── unit/                 # Isolated Vitest coverage
│   ├── integration/          # Filesystem and workspace Vitest coverage
│   ├── e2e/                  # Playwright coverage against example apps
│   └── fixtures/             # Shared test fixtures
└── turbo.json
```

### Build System

```bash
# Build the workspace with Turborepo
pnpm build

# Build just the published CLI package
pnpm --filter next-openapi-gen build

# Rebuild the CLI package in watch mode
pnpm --filter next-openapi-gen exec tsc --watch
```

### Editor Setup

This repository commits workspace defaults in `.vscode/` so contributors and agents use the same TypeScript SDK, Oxc formatter, and common tasks in VS Code or Cursor.

- Install the recommended `oxc.oxc-vscode` extension
- Use the workspace TypeScript version when prompted
- Use the committed `check`, `test`, and `build` tasks if you prefer running scripts from the editor

### Testing

```bash
# Run all workspace tests
pnpm test

# Run only the unit suite
pnpm test:unit

# Run only the integration suite
pnpm test:integration

# Watch or inspect the Vitest suites
pnpm test:watch
pnpm test:ui

# Coverage report for unit + integration tests
pnpm test:coverage

# Run the Playwright suite against next-app-zod
pnpm test:e2e
```

### Knip

```bash
# Full local report
pnpm knip

# Compact CI-style report
pnpm knip:ci
```

Use Knip findings to remove real unused files, exports, and dependencies first. Only add a targeted exception in `knip.mts` when a file is intentionally discovered indirectly, such as published UI templates, test fixtures, or example-app schema inputs scanned by the generator.

### Local Testing

To test the CLI locally inside this workspace:

```bash
# Install dependencies and build the workspace
pnpm install
pnpm build

# Run an example app against the workspace package
cd apps/next-app-zod
pnpm exec next-openapi-gen generate
pnpm dev
```

To test the CLI in another local project:

```bash
# From the repository root
pnpm build
pnpm link --global

# In another Next.js project
cd /path/to/your/nextjs/app
pnpm link --global next-openapi-gen
next-openapi-gen init
next-openapi-gen generate

# Unlink when done
pnpm unlink --global next-openapi-gen
```

---

## Release Process

**Note:** Only maintainers can create releases.

### For Maintainers

We use [`np`](https://github.com/sindresorhus/np) for interactive releases with automatic changelog generation.

#### Creating a Release

```bash
pnpm run release
```

This will:

1. ✅ Run tests
2. ✅ Build the project
3. ✅ Prompt you to select version (patch/minor/major)
4. ✅ Auto-generate CHANGELOG.md from commits
5. ✅ Update package.json version
6. ✅ Create git tag
7. ✅ Push to GitHub
8. ✅ Publish to npm
9. ✅ Create GitHub Release

#### Manual Version Selection

```bash
# Specific version
pnpm exec np 1.0.0

# Beta release
pnpm exec np 1.0.0-beta.1

# Only tag, skip npm publish
pnpm exec np --no-publish
```

#### Version Bump Guidelines

Based on commit types since last release:

- **MAJOR (1.0.0):** Breaking changes (`feat!:`, `fix!:`, or `BREAKING CHANGE:` in commits)
- **MINOR (0.9.0):** New features (`feat:`)
- **PATCH (0.8.1):** Bug fixes (`fix:`, `perf:`)

---

## Questions?

- 💬 Open a [Discussion](https://github.com/tazo90/next-openapi-gen/discussions)
- 🐛 Report bugs via [Issues](https://github.com/tazo90/next-openapi-gen/issues)
- 📧 Contact maintainer: Mariusz Winnik

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

Thank you for making **next-openapi-gen** better! 🚀
