import fs from "node:fs";
import path from "node:path";

import { load as loadYaml } from "js-yaml";

export function loadYamlOrJson(filePath: string): unknown {
  const content = fs.readFileSync(filePath, "utf-8");
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".yaml" || extension === ".yml") {
    return loadYaml(content);
  }
  return JSON.parse(content) as unknown;
}
