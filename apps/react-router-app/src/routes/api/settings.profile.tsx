import type { ProfileSettings } from "../../schemas/models";

/**
 * Load profile settings.
 * @operationId reactRouterGetProfileSettings
 * @response ProfileSettings
 * @tag Settings
 * @responseSet common
 * @openapi
 */
export async function loader() {
  return {
    locale: "en-US",
    theme: "dark",
  } satisfies ProfileSettings;
}

export default function SettingsRoute() {
  return (
    <main>
      <h1>Settings profile</h1>
      <pre>{JSON.stringify({ locale: "en-US", theme: "dark" }, null, 2)}</pre>
    </main>
  );
}
