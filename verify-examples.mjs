import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(repoRoot, "dist", "index.js");

const representativeExamples = [
  "examples/next15-pages-router",
  "examples/next15-app-drizzle-zod",
  "examples/next15-app-mixed-schemas",
];

for (const examplePath of representativeExamples) {
  const exampleDir = path.join(repoRoot, examplePath);
  const templatePath = path.join(exampleDir, "next.openapi.json");
  const tempDir = mkdtempSync(path.join(tmpdir(), "next-openapi-gen-quality-"));
  const outputDir = path.join(tempDir, "public");
  const tempTemplatePath = path.join(tempDir, "next.openapi.quality.json");

  try {
    const template = JSON.parse(readFileSync(templatePath, "utf8"));
    const outputFile = template.outputFile ?? "openapi.json";

    writeFileSync(
      tempTemplatePath,
      JSON.stringify(
        {
          ...template,
          outputDir,
        },
        null,
        2,
      ),
    );

    execFileSync(
      "node",
      [cliPath, "generate", "--template", tempTemplatePath],
      {
        cwd: exampleDir,
        stdio: "inherit",
      },
    );

    const generatedFilePath = path.join(outputDir, outputFile);

    if (!existsSync(generatedFilePath)) {
      throw new Error(`Expected generated file at ${generatedFilePath}`);
    }

    process.stdout.write(`Verified ${examplePath}\n`);
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}
