import path from "node:path";

import { describe, expect, it } from "vitest";

import { generateProjectSpec } from "../../helpers/test-project.js";

const rootDir = process.cwd();
const zodAppPath = path.join(rootDir, "apps", "next-app-zod");

describe("next-app-zod inference smoke", () => {
  it("infers UUID path params from handler validation without @pathParams", () => {
    const { project, spec } = generateProjectSpec({
      projectPath: zodAppPath,
    });

    try {
      const organizationIdParam = spec.paths?.[
        "/organizations/{organizationId}"
      ]?.get?.parameters?.find((parameter) => parameter.name === "organizationId");

      expect(organizationIdParam).toMatchObject({
        in: "path",
        required: true,
        schema: {
          type: "string",
          format: "uuid",
        },
      });
    } finally {
      project.cleanup();
    }
  });
});
