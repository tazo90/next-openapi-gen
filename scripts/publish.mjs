import { execSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const rootDir = join(import.meta.dirname, "..");
const pkgDir = join(rootDir, "packages", "next-openapi-gen");
const pkgPath = join(pkgDir, "package.json");
const readmeSrc = join(rootDir, "README.md");
const readmeDst = join(pkgDir, "README.md");

// Rebuild from source so we never pack a stale dist/. The `...` suffix pulls the
// workspace dependencies into the turbo scope so their dist/ exists before tsup
// bundles them; without it turbo builds this package alone and esbuild fails to
// resolve @workspace/* imports.
execSync("pnpm exec turbo run build --filter=next-openapi-gen... --force", {
  cwd: rootDir,
  stdio: "inherit",
});

const original = readFileSync(pkgPath, "utf8");
const pkg = JSON.parse(original);

// Strip workspace-only devDependencies before packing the public package. This
// runs after the build: while the manifest is stripped, any `pnpm install` would
// prune the @workspace/* links from node_modules and break the build.
for (const [key, value] of Object.entries(pkg.devDependencies ?? {})) {
  if (String(value).startsWith("workspace:")) {
    delete pkg.devDependencies[key];
  }
}

writeFileSync(pkgPath, JSON.stringify(pkg, null, "\t") + "\n");

// Copy root README.md into package dir for inclusion in the tarball
copyFileSync(readmeSrc, readmeDst);

try {
  // pnpm pack resolves catalog: → real versions
  execSync("pnpm pack", { cwd: pkgDir, stdio: "inherit" });

  const tarball = readdirSync(pkgDir).find((f) => f.endsWith(".tgz"));
  if (!tarball) throw new Error("No tarball found after pnpm pack");

  const tarballPath = join(pkgDir, tarball);

  execSync(`pnpm publish "${tarballPath}" --access public --no-git-checks`, {
    stdio: "inherit",
  });

  unlinkSync(tarballPath);
} finally {
  // Always restore original package.json and remove temp README
  writeFileSync(pkgPath, original);
  if (existsSync(readmeDst)) unlinkSync(readmeDst);
}
