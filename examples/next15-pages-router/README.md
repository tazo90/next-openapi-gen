# Next.js 15 Pages Router Example

This example demonstrates how to use `next-openapi-gen` with the **legacy Pages Router** in Next.js.

## Key Differences from App Router

The Pages Router uses a different file structure and API pattern:

| Feature | App Router | Pages Router |
|---------|------------|--------------|
| API Location | `src/app/api/` | `pages/api/` |
| Route Files | `route.ts` | Any `.ts` file (e.g., `users.ts`, `[id].ts`) |
| Handler Export | `export async function GET/POST/...` | `export default function handler` |
| Method Detection | Function name (GET, POST, etc.) | `@method` JSDoc tag |

## Configuration

In `next.openapi.json`, set `routerType` to `"pages"`:

```json
{
  "routerType": "pages",
  "apiDir": "./pages/api",
  "schemaDir": "./schemas",
  "schemaType": "zod"
}
```

## Documenting Pages Router APIs

Since Pages Router uses a single `handler` function for all HTTP methods, you need to use the `@method` JSDoc tag to specify which HTTP method each documentation block applies to:

```typescript
// pages/api/users/index.ts
import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Get all users
 * @description Retrieve a list of all users
 * @params UserListParamsSchema
 * @response UserSchema[]
 * @method GET
 * @openapi
 */
/**
 * Create a new user
 * @description Create a new user account
 * @body CreateUserSchema
 * @response 201:UserSchema
 * @method POST
 * @openapi
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    // Handle GET request
  } else if (req.method === "POST") {
    // Handle POST request
  }
}
```

### Key Points:

1. **Multiple JSDoc blocks**: Add a separate JSDoc comment for each HTTP method you want to document
2. **`@method` tag**: Required to specify the HTTP method (GET, POST, PUT, PATCH, DELETE)
3. **`@openapi` tag**: Include this tag if you have `includeOpenApiRoutes: true` in your config
4. **File naming**:
   - `pages/api/users/index.ts` → `/users`
   - `pages/api/users/[id].ts` → `/users/{id}`

## Running the Example

```bash
# Install dependencies
npm install

# Generate OpenAPI documentation
npx next-openapi-gen generate

# Start the development server
npm run dev
```

Then open http://localhost:3000/api-docs to view the generated documentation.

## Supported JSDoc Tags

All standard tags work with Pages Router:

| Tag | Description |
|-----|-------------|
| `@method` | **Required for Pages Router** - HTTP method (GET, POST, PUT, PATCH, DELETE) |
| `@description` | Endpoint description |
| `@params` / `@queryParams` | Query parameters schema |
| `@pathParams` | Path parameters schema |
| `@body` | Request body schema |
| `@response` | Response schema with optional status code |
| `@auth` | Authentication type (bearer, basic, apikey) |
| `@tag` | Custom tag for grouping |
| `@openapi` | Mark for inclusion when `includeOpenApiRoutes` is enabled |
| `@ignore` | Exclude from documentation |
| `@deprecated` | Mark as deprecated |
