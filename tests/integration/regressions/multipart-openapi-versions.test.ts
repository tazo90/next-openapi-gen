import { describe, expect, it } from "vitest";

import { generateFixtureSpec, getProjectFixturePath } from "../../helpers/test-project.js";

const appRouterCoreFixture = getProjectFixturePath("next", "app-router", "core-flow");

describe("multipart OpenAPI version output", () => {
  it.each(["3.0", "3.1", "3.2"] as const)(
    "emits object-backed multipart bodies for OpenAPI %s",
    (openapiVersion) => {
      const { project, spec } = generateFixtureSpec({
        fixturePath: appRouterCoreFixture,
        openapiVersion,
      });

      try {
        const logoUpload = spec.paths?.["/uploads/logo"]?.post?.requestBody;
        expect(logoUpload?.content?.["multipart/form-data"]?.schema).toMatchObject({
          type: "object",
          required: ["file"],
          properties: {
            file:
              openapiVersion === "3.0"
                ? { type: "string", format: "binary" }
                : { type: "string", contentMediaType: "application/octet-stream" },
          },
        });

        const avatarUpload = spec.paths?.["/uploads/avatar"]?.post?.requestBody;
        expect(avatarUpload?.content?.["multipart/form-data"]?.schema?.$ref).toBe(
          "#/components/schemas/AvatarUploadFormData",
        );
      } finally {
        project.cleanup();
      }
    },
  );
});
