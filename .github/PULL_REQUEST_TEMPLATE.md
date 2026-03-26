# Pull Request

## Description

<!-- Describe your changes in a few sentences -->

## Type of Change

- [ ] ✨ **feat:** New feature
- [ ] � **fix:** Bug fix
- [ ] 📝 **docs:** Documentation update
- [ ] ♻️ **refactor:** Code refactoring
- [ ] ⚡ **perf:** Performance improvement
- [ ] 💥 **Breaking change** (add `!` after type, e.g., `feat!:`)

## Checklist

- [ ] `pnpm check` passes
- [ ] Tested locally (`pnpm test` and `pnpm build` when relevant)
- [ ] Documentation updated (if needed)

---

## ⚠️ PR Title Format Required

Your **PR title** must follow [Conventional Commits](https://www.conventionalcommits.org/):

### ✅ Good Examples

```text
feat: add support for multiple schema types
fix: resolve path parameter detection issue
docs: update configuration examples
```

### ❌ Bad Examples

```text
Added feature
Fixed bug
Update README
```

**Why?** We use squash merge - your PR title becomes the commit message and is used for:

- 📊 Auto-generating changelogs
- 🏷️ Version bumping (`feat:` = minor, `fix:` = patch)
- 📖 Clean git history

See [CONTRIBUTING.md](../CONTRIBUTING.md) for details.

---

Thanks for contributing! 🚀
