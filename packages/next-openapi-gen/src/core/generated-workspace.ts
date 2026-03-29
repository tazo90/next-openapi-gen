import path from "node:path";

import { DEFAULT_GENERATED_WORKSPACE_DIR } from "./defaults.js";

export function resolveGeneratedWorkspaceDir(customDir?: string): string {
  return path.resolve(process.cwd(), customDir ?? DEFAULT_GENERATED_WORKSPACE_DIR);
}
