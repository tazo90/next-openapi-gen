# Mixed Schema Types Example

This example demonstrates using **multiple schema types simultaneously** with next-openapi-gen:

- **Zod schemas** (`src/schemas/zod-schemas.ts`)
- **TypeScript types** (`src/schemas/typescript-types.ts`)
- **Custom OpenAPI YAML files** (`src/schemas/custom-schemas.yaml`)

## Features Demonstrated

### 1. Zod Schemas

- `UserSchema`, `CreateUserSchema`, `UpdateUserSchema`
- `ProductSchema`, `CreateProductSchema`
- Used in `/api/users` and `/api/products` endpoints

### 2. TypeScript Types

- `Order`, `OrderItem`, `OrderStatus`
- `PaginationParams`, `PaginatedResponse<T>`
- Used in `/api/orders` endpoint

### 3. Custom YAML Schemas (from external source, e.g., protobuf)

- `Role`, `Permission`
- `ApiMetadata`
- Used in `/api/roles` and `/api/metadata` endpoints

## Configuration

The `next.openapi.json` config shows how to enable multiple schema types:

```json
{
  "schemaType": ["zod", "typescript"],
  "schemaFiles": ["./src/schemas/custom-schemas.yaml"],
  "schemaDir": "./src/schemas"
}
```

## Priority System

Schemas are resolved with automatic priority:

1. **Custom files** (highest) - from `schemaFiles`
2. **Zod schemas** (medium) - from `schemaDir` with `.ts` extension
3. **TypeScript types** (lowest/fallback) - from `schemaDir` with `.ts` extension

## Getting Started

```bash
# Install dependencies
npm install

# Generate OpenAPI documentation
npm run openapi:generate

# Start development server
npm run dev
```

Then visit:

- **Home**: http://localhost:3000
- **API Docs**: http://localhost:3000/api-docs
- **OpenAPI Spec**: http://localhost:3000/openapi.json

## Use Cases

This setup is perfect for:

- Projects migrating from TypeScript to Zod gradually
- Using external API schemas (protobuf, GraphQL, etc.)
- Combining hand-written and generated schemas
- Large codebases with mixed schema sources
