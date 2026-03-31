import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
  copyFileSync,
  existsSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const rootDir = join(import.meta.dirname, "..");
const pkgDir = join(rootDir, "packages", "next-openapi-gen");
const pkgPath = join(pkgDir, "package.json");
const readmeSrc = join(rootDir, "README.md");
const readmeDst = join(pkgDir, "README.md");

const original = readFileSync(pkgPath, "utf8");
const pkg = JSON.parse(original);

// Strip workspace:* devDependencies (pnpm v10 can't resolve them for private packages)
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

  execSync(`npm publish "${tarballPath}" --access public`, { stdio: "inherit" });

  unlinkSync(tarballPath);
} finally {
  // Always restore original package.json and remove temp README
  writeFileSync(pkgPath, original);
  if (existsSync(readmeDst)) unlinkSync(readmeDst);
}
