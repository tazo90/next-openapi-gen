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
npm install
```

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

```
<type>: <description>

[optional body]

[optional footer]
```

### Types

| Type | Description | Version Bump | Example |
|------|-------------|--------------|---------|
| `feat:` | New feature | MINOR (0.8.0 → 0.9.0) | `feat: add Drizzle ORM support` |
| `fix:` | Bug fix | PATCH (0.8.0 → 0.8.1) | `fix: resolve type errors` |
| `perf:` | Performance improvement | PATCH | `perf: optimize schema processing` |
| `docs:` | Documentation only | None | `docs: update README examples` |
| `style:` | Code formatting | None | `style: fix indentation` |
| `refactor:` | Code refactoring | None | `refactor: simplify route processor` |
| `test:` | Tests only | None | `test: add unit tests for converter` |
| `build:` | Build system changes | None | `build: update tsconfig` |
| `ci:` | CI/CD changes | None | `ci: add workflow` |
| `chore:` | Maintenance tasks | None | `chore: update dependencies` |

### Breaking Changes

For breaking changes, add `!` after the type or include `BREAKING CHANGE:` in the footer:

```
feat!: migrate to ESM modules

BREAKING CHANGE: CommonJS is no longer supported. 
Node.js 16 is no longer supported, minimum version is now 18.0.0.
```

**Version bump:** MAJOR (0.8.0 → 1.0.0)

### Examples

✅ **Good commit messages:**

```
feat: add support for Drizzle ORM schemas
fix: resolve crash on dynamic routes
perf: improve OpenAPI generation speed by 40%
docs: add examples for Zod integration
refactor: simplify schema processor logic
test: add integration tests for route processor
```

❌ **Bad commit messages:**

```
added feature
fix
update
WIP
Fixed stuff
```

### Scope (Optional)

You can add a scope for more context:

```
feat(drizzle): add support for Drizzle schemas
fix(types): resolve TypeScript errors in route processor
docs(readme): add installation instructions
```

---

## Pull Request Process

### 1. Ensure Your Code Quality

Before submitting a PR:

```bash
# Run tests
npm test

# Build the project
npm run build

# Ensure no TypeScript errors
npx tsc --noEmit
```

### 2. Update Documentation

- Update README.md if you added new features
- Add JSDoc comments for new functions/classes
- Update examples if needed

### 3. Create a Pull Request

**Important:** Your PR title must follow the Conventional Commits format!

#### ✅ Good PR Titles:

```
feat: add support for Drizzle ORM schemas
fix: resolve TypeScript type errors in route processor
docs: update README with new examples
```

#### ❌ Bad PR Titles:

```
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

```
next-openapi-gen/
├── src/
│   ├── commands/       # CLI commands (init, generate)
│   ├── components/     # UI components (Swagger, Scalar, etc.)
│   ├── lib/           # Core logic
│   │   ├── openapi-generator.ts
│   │   ├── route-processor.ts
│   │   ├── schema-processor.ts
│   │   └── zod-converter.ts
│   └── index.ts       # Entry point
├── tests/             # Test files
├── examples/          # Example Next.js apps
└── dist/             # Build output (ignored)
```

### Build System

```bash
# Clean build artifacts
npm run clean

# Build TypeScript
npm run build

# Watch mode (auto-rebuild on changes)
npx tsc --watch
```

### Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# UI mode
npm run test:ui

# Coverage report
npm run test:coverage
```

### Local Testing

To test the CLI locally:

```bash
# Build first
npm run build

# Link globally
npm link

# Now you can use it in any Next.js project
cd /path/to/your/nextjs/app
next-openapi-gen init
next-openapi-gen generate

# Unlink when done
npm unlink -g next-openapi-gen
```

---

## Release Process

**Note:** Only maintainers can create releases.

### For Maintainers

We use [`np`](https://github.com/sindresorhus/np) for interactive releases with automatic changelog generation.

#### Creating a Release

```bash
npm run release
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
npx np 1.0.0

# Beta release
npx np 1.0.0-beta.1

# Only tag, skip npm publish
npx np --no-publish
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
