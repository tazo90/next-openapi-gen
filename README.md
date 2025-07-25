# next-openapi-gen

Automatically generate OpenAPI 3.0 documentation from Next.js projects, with support for Zod schemas and TypeScript types.

## Features

- ✅ Automatic OpenAPI documentation generation from Next.js code
- ✅ Support for Next.js App Router (including `/api/users/[id]/route.ts` routes)
- ✅ Zod schemas support
- ✅ TypeScript types support
- ✅ JSDoc comments support
- ✅ Multiple UI interfaces: `Scalar`, `Swagger`, `Redoc`, `Stoplight` and `Rapidoc` available at `/api-docs` url
- ✅ Path parameters detection (`/users/{id}`)
- ✅ Intelligent parameter examples
- ✅ Intuitive CLI for initialization and documentation generation

## Supported interfaces

- Scalar 🆕
- Swagger
- Redoc
- Stoplight Elements
- RapiDoc

## Installation

```bash
npm install next-openapi-gen --save-dev
```

## Quick Start

```bash
# Initialize OpenAPI configuration
npx next-openapi-gen init --ui scalar --docs-url api-docs --schema zod

# Generate OpenAPI documentation
npx next-openapi-gen generate
```

## Configuration

During initialization (`npx next-openapi-gen init`), a configuration file `next.openapi.json` will be created in the project's root directory:

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "Next.js API",
    "version": "1.0.0",
    "description": "API generated by next-openapi-gen"
  },
  "servers": [
    {
      "url": "http://localhost:3000",
      "description": "Local server"
    }
  ],
  "apiDir": "src/app/api",
  "schemaDir": "src/types", // or "src/schemas" for Zod schemas
  "schemaType": "zod", // or "typescript" for TypeScript types
  "outputFile": "openapi.json",
  "docsUrl": "/api-docs",
  "includeOpenApiRoutes": false,
  "debug": false
}
```

### Configuration Options

| Option                 | Description                                      |
| ---------------------- | ------------------------------------------------ |
| `apiDir`               | Path to the API directory                        |
| `schemaDir`            | Path to the types/schemas directory              |
| `schemaType`           | Schema type: `"zod"` or `"typescript"`           |
| `outputFile`           | Path to the OpenAPI output file                  |
| `docsUrl`              | API documentation URL (for Swagger UI)           |
| `includeOpenApiRoutes` | Whether to include only routes with @openapi tag |
| `defaultResponseSet`   | Default error response set for all endpoints     |
| `responseSets`         | Named sets of error response codes               |
| `errorConfig`          | Error schema configuration                       |
| `debug`                | Enable detailed logging during generation        |

## Documenting Your API

### With Zod Schemas

```typescript
// src/app/api/products/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const ProductParams = z.object({
  id: z.string().describe("Product ID"),
});

export const ProductResponse = z.object({
  id: z.string().describe("Product ID"),
  name: z.string().describe("Product name"),
  price: z.number().positive().describe("Product price"),
});

/**
 * Get product information
 * @description Fetches detailed product information by ID
 * @pathParams ProductParams
 * @response ProductResponse
 * @openapi
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Implementation...
}
```

### With TypeScript Types

```typescript
// src/app/api/users/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";

type UserParams = {
  id: string; // User ID
};

type UserResponse = {
  id: string; // User ID
  name: string; // Full name
  email: string; // Email address
};

/**
 * Get user information
 * @description Fetches detailed user information by ID
 * @pathParams UserParams
 * @response UserResponse
 * @openapi
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Implementation...
}
```

## JSDoc Documentation Tags

| Tag                    | Description                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `@description`         | Endpoint description                                                                                                     |
| `@pathParams`          | Path parameters type/schema                                                                                              |
| `@params`              | Query parameters type/schema                                                                                             |
| `@body`                | Request body type/schema                                                                                                 |
| `@bodyDescription`     | Request body description                                                                                                 |
| `@response`            | Response type/schema with optional code and description (`User`, `201:User`, `User:Description`, `201:User:Description`) |
| `@responseDescription` | Response description                                                                                                     |
| `@responseSet`         | Override default response set (`public`, `auth`, `none`)                                                                 |
| `@add`                 | Add custom response codes (`409:ConflictResponse`, `429`)                                                                |
| `@contentType`         | Request body content type (`application/json`, `multipart/form-data`)                                                    |
| `@auth`                | Authorization type (`bearer`, `basic`, `apikey`)                                                                         |
| `@tag`                 | Custom tag                                                                                                               |
| `@deprecated`          | Marks the route as deprecated                                                                                            |
| `@openapi`             | Marks the route for inclusion in documentation (if includeOpenApiRoutes is enabled)                                      |

## CLI Usage

### 1. Initialization

```bash
npx next-openapi-gen init
```

This command will generate following elements:

- Generate `next.openapi.json` configuration file
- Set up `Scalar` UI for documentation display
- Add `/api-docs` page to display OpenAPI documentation
- Configure `zod` as the default schema tool

### 2. Generate Documentation

```bash
npx next-openapi-gen generate
```

This command will generate OpenAPI documentation based on your API code:

- Scan API directories for routes
- Analyze types/schemas
- Generate OpenAPI file (`openapi.json`) in `public` folder
- Create Scalar/Swagger UI endpoint and page (if enabled)

### 3. View API Documentation

To see API documenation go to `http://localhost:3000/api-docs`

## Examples

### Path Parameters

```typescript
// src/app/api/users/[id]/route.ts

// Zod
const UserParams = z.object({
  id: z.string().describe("User ID"),
});

// Or TypeScript
type UserParams = {
  id: string; // User ID
};

/**
 * @pathParams UserParams
 */
export async function GET() {
  // ...
}
```

### Query Parameters

```typescript
// src/app/api/users/route.ts

// Zod
const UsersQueryParams = z.object({
  page: z.number().optional().describe("Page number"),
  limit: z.number().optional().describe("Results per page"),
  search: z.string().optional().describe("Search phrase"),
});

// Or TypeScript
type UsersQueryParams = {
  page?: number; // Page number
  limit?: number; // Results per page
  search?: string; // Search phrase
};

/**
 * @params UsersQueryParams
 */
export async function GET() {
  // ...
}
```

### Request Body

```typescript
// src/app/api/users/route.ts

// Zod
const CreateUserBody = z.object({
  name: z.string().describe("Full name"),
  email: z.string().email().describe("Email address"),
  password: z.string().min(8).describe("Password"),
});

// Or TypeScript
type CreateUserBody = {
  name: string; // Full name
  email: string; // Email address
  password: string; // Password
};

/**
 * @body CreateUserBody
 * @bodyDescription User registration data including email and password
 */
export async function POST() {
  // ...
}
```

### Response

```typescript
// src/app/api/users/route.ts

// Zod
const UserResponse = z.object({
  id: z.string().describe("User ID"),
  name: z.string().describe("Full name"),
  email: z.string().email().describe("Email address"),
  createdAt: z.date().describe("Creation date"),
});

// Or TypeScript
type UserResponse = {
  id: string; // User ID
  name: string; // Full name
  email: string; // Email address
  createdAt: Date; // Creation date
};

/**
 * @response UserResponse
 * @responseDescription Returns newly created user object
 */
export async function GET() {
  // ...
}

// Alternative formats with inline description
/**
 * @response UserResponse:Returns user profile data
 */
export async function GET() {
  // ...
}

/**
 * @response 201:UserResponse:Returns newly created user
 */
export async function POST() {
  // ...
}

/**
 * @response 204:Empty:User successfully deleted
 */
export async function DELETE() {
  // ...
}
```

### Authorization

```typescript
// src/app/api/protected/route.ts

/**
 * @auth bearer
 */
export async function GET() {
  // ...
}
```

### Deprecated

```typescript
// src/app/api/v1/route.ts

// Zod
const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  fullName: z.string().optional().describe("@deprecated Use name instead"),
  email: z.string().email(),
});

// Or TypeScript
type UserResponse = {
  id: string;
  name: string;
  /** @deprecated Use firstName and lastName instead */
  fullName?: string;
  email: string;
};

/**
 * @body UserSchema
 * @response UserResponse
 */
export async function GET() {
  // ...
}
```

### File Uploads / Multipart Form Data

```typescript
// src/app/api/upload/route.ts

// Zod
const FileUploadSchema = z.object({
  file: z.custom<File>().describe("Image file (PNG/JPG)"),
  description: z.string().optional().describe("File description"),
  category: z.string().describe("File category"),
});

// Or TypeScript
type FileUploadFormData = {
  file: File;
  description?: string;
  category: string;
};

/**
 * @body FileUploadSchema
 * @contentType multipart/form-data
 */
export async function POST() {
  // ...
}
```

## Response Management

### Zero Config + Response Sets

Configure reusable error sets in `next.openapi.json`:

```json
{
  "defaultResponseSet": "common",
  "responseSets": {
    "common": ["400", "401", "500"],
    "public": ["400", "500"],
    "auth": ["400", "401", "403", "500"]
  }
}
```

### Usage Examples

```typescript
/**
 * Auto-default responses
 * @response UserResponse
 * @openapi
 */
export async function GET() {}
// Generates: 200:UserResponse + common errors (400, 401, 500)

/**
 * With custom description inline
 * @response UserResponse:Complete user profile information
 * @openapi
 */
export async function GET() {}
// Generates: 200:UserResponse (with custom description) + common errors

/**
 * Override response set
 * @response ProductResponse
 * @responseSet public
 * @openapi
 */
export async function GET() {}
// Generates: 200:ProductResponse + public errors (400, 500)

/**
 * Add custom responses with description
 * @response 201:UserResponse:User created successfully
 * @add 409:ConflictResponse
 * @openapi
 */
export async function POST() {}
// Generates: 201:UserResponse (with custom description) + common errors + 409:ConflictResponse

/**
 * Combine multiple sets
 * @response UserResponse
 * @responseSet auth,crud
 * @add 429:RateLimitResponse
 * @openapi
 */
export async function PUT() {}
// Combines: auth + crud errors + custom 429
```

### Error Schema Configuration

#### Define consistent error schemas using templates:

```json
{
  "defaultResponseSet": "common",
  "responseSets": {
    "common": ["400", "500"],
    "auth": ["400", "401", "403", "500"],
    "public": ["400", "500"]
  },
  "errorConfig": {
    "template": {
      "type": "object",
      "properties": {
        "error": {
          "type": "string",
          "example": "{{ERROR_MESSAGE}}"
        },
        "code": {
          "type": "string",
          "example": "{{ERROR_CODE}}"
        }
      }
    },
    "codes": {
      "400": {
        "description": "Bad Request",
        "variables": {
          "ERROR_MESSAGE": "Invalid request parameters",
          "ERROR_CODE": "BAD_REQUEST"
        }
      },
      "401": {
        "description": "Unauthorized",
        "variables": {
          "ERROR_MESSAGE": "Authentication required",
          "ERROR_CODE": "UNAUTHORIZED"
        }
      },
      "403": {
        "description": "Forbidden",
        "variables": {
          "ERROR_MESSAGE": "Access denied",
          "ERROR_CODE": "FORBIDDEN"
        }
      },
      "404": {
        "description": "Not Found",
        "variables": {
          "ERROR_MESSAGE": "Resource not found",
          "ERROR_CODE": "NOT_FOUND"
        }
      },
      "500": {
        "description": "Internal Server Error",
        "variables": {
          "ERROR_MESSAGE": "An unexpected error occurred",
          "ERROR_CODE": "INTERNAL_ERROR"
        }
      }
    }
  }
}
```

## Advanced Usage

### Automatic Path Parameter Detection

The library automatically detects path parameters and generates documentation for them:

```typescript
// src/app/api/users/[id]/posts/[postId]/route.ts

// Will automatically detect 'id' and 'postId' parameters
export async function GET() {
  // ...
}
```

If no type/schema is provided for path parameters, a default schema will be generated.

### Intelligent Examples

The library generates intelligent examples for parameters based on their name:

| Parameter name | Example                                  |
| -------------- | ---------------------------------------- |
| `id`, `*Id`    | `"123"` or `123`                         |
| `slug`         | `"example-slug"`                         |
| `uuid`         | `"123e4567-e89b-12d3-a456-426614174000"` |
| `email`        | `"user@example.com"`                     |
| `name`         | `"example-name"`                         |
| `date`         | `"2023-01-01"`                           |

## Advanced Zod Features

The library supports advanced Zod features such as:

### Validation Chains

```typescript
// Zod validation chains are properly converted to OpenAPI schemas
const EmailSchema = z
  .string()
  .email()
  .min(5)
  .max(100)
  .describe("Email address");

// Converts to OpenAPI with email format, minLength and maxLength
```

### Type Aliases with z.infer

```typescript
// You can use TypeScript with Zod types
import { z } from "zod";

const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2),
});

// Use z.infer to create a TypeScript type
type User = z.infer<typeof UserSchema>;

// The library will be able to recognize this schema by reference `UserSchema` or `User` type.
```

## Available UI providers

<div align="center">
<table>
  <thead>
   <th>Scalar</th>
   <th>Swagger</th>
   <th>Redoc</th>
   <th>Stoplight Elements</th>
   <th>RapiDoc</th>
  </thead>
  <tbody>
   <tr>
   <td>
	<img width="320" alt="scalar" src="https://raw.githubusercontent.com/tazo90/next-openapi-gen/refs/heads/main/assets/scalar.png" alt-text="scalar">
	</td>
    <td>
	<img width="320" alt="swagger" src="https://raw.githubusercontent.com/tazo90/next-openapi-gen/refs/heads/main/assets/swagger.png" alt-text="swagger">
	</td>
	<td>
	<img width="320" alt="redoc" src="https://raw.githubusercontent.com/tazo90/next-openapi-gen/refs/heads/main/assets/redoc.png" alt-text="redoc">
	</td>
	<td>
	<img width="320" alt="stoplight" src="https://raw.githubusercontent.com/tazo90/next-openapi-gen/refs/heads/main/assets/stoplight.png" alt-text="stoplight">
	</td>
	<td>
	<img width="320" alt="rapidoc" src="https://raw.githubusercontent.com/tazo90/next-openapi-gen/refs/heads/main/assets/rapidoc.png" alt-text="rapidoc">
	</td>
   </tr>
  </tbody>
</table>
</div>

## License

MIT
