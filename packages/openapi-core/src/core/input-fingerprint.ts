import crypto from "node:crypto";
import fs from "node:fs";

export type DiskCacheInputRecord = {
  hash: string;
  mtimeMs: number;
  size: number;
};

export function createInputFingerprint(
  files: string[],
  previousInputs: Record<string, DiskCacheInputRecord> = {},
): {
  fingerprint: string;
  inputs: Record<string, DiskCacheInputRecord>;
} {
  const hash = crypto.createHash("sha256");
  const inputs: Record<string, DiskCacheInputRecord> = {};
  for (const file of files) {
    const stat = fs.statSync(file);
    const previousInput = previousInputs[file];
    const fileHash =
      previousInput && previousInput.mtimeMs === stat.mtimeMs && previousInput.size === stat.size
        ? previousInput.hash
        : createFileHash(file);
    inputs[file] = {
      hash: fileHash,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    };
    hash.update(file);
    hash.update(String(stat.mtimeMs));
    hash.update(String(stat.size));
    hash.update(fileHash);
  }
  return {
    fingerprint: hash.digest("hex"),
    inputs,
  };
}

function createFileHash(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
