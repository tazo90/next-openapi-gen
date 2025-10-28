## 📝 Pull Request

### Description

<!-- Provide a clear and concise description of your changes -->

### Type of Change

<!-- Put an `x` in the box that applies -->

- [ ] 🐛 **Bug fix** (`fix:`) - Fixes an issue
- [ ] ✨ **New feature** (`feat:`) - Adds new functionality
- [ ] 💥 **Breaking change** (`feat!:` or `fix!:`) - Changes that break backward compatibility
- [ ] 📝 **Documentation** (`docs:`) - Documentation only changes
- [ ] ♻️ **Refactoring** (`refactor:`) - Code changes that neither fix bugs nor add features
- [ ] ⚡ **Performance** (`perf:`) - Performance improvements
- [ ] ✅ **Tests** (`test:`) - Adding or updating tests
- [ ] 🔧 **Chore** (`chore:`) - Other changes (dependencies, build config, etc.)

### Checklist

<!-- Put an `x` in the boxes that apply -->

- [ ] My code follows the existing code style
- [ ] I have tested my changes locally
- [ ] I have added/updated tests if needed
- [ ] I have updated the documentation if needed

---

## ⚠️ Important: PR Title Format

**Your PR title must follow [Conventional Commits](https://www.conventionalcommits.org/) format:**

### ✅ Good Examples:

```
feat: add support for Drizzle ORM schemas
fix: resolve TypeScript type errors in route processor
perf: improve schema processing performance by 50%
docs: update README with new examples
```

### ❌ Bad Examples:

```
Added drizzle support
Fixed bugs
Update
WIP
```

### 💡 Why?

We use **squash merge**, so your **PR title becomes the commit message** in the main branch. This helps us:

- 📊 Auto-generate professional changelogs
- 🏷️ Automatically determine version bumps
- 📖 Maintain a clean and readable git history

### 📋 Format Rules:

```
<type>: <description>

Types:
- feat:     New feature (bumps MINOR version)
- fix:      Bug fix (bumps PATCH version)
- perf:     Performance improvement (bumps PATCH version)
- docs:     Documentation changes (no version bump)
- style:    Code style/formatting (no version bump)
- refactor: Code refactoring (no version bump)
- test:     Tests (no version bump)
- chore:    Maintenance tasks (no version bump)
- ci:       CI/CD changes (no version bump)

Breaking Changes (bumps MAJOR version):
- feat!: or fix!: with breaking changes
```

### 📚 More Info:

See [CONTRIBUTING.md](../CONTRIBUTING.md) for detailed guidelines.

---

Thank you for contributing to **next-openapi-gen**! 🚀
