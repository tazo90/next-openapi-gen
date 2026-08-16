import { Home } from "./home";

export default function HomePage() {
  return (
    <Home.Frame>
      <Home.Header>Mixed Schema Types API Example</Home.Header>
      <Home.Intro>
        This example demonstrates using <strong>multiple schema types</strong> simultaneously:
      </Home.Intro>
      <Home.List>
        <Home.Item name="Zod schemas">
          UserSchema, ProductSchema (<code>src/schemas/zod-schemas.ts</code>)
        </Home.Item>
        <Home.Item name="TypeScript types">
          Order, OrderItem, PaginationParams (<code>src/schemas/typescript-types.ts</code>)
        </Home.Item>
        <Home.Item name="Custom YAML schemas">
          Role, Permission, ApiMetadata (<code>src/schemas/custom-schemas.yaml</code>)
        </Home.Item>
      </Home.List>
      <Home.Heading>API Endpoints:</Home.Heading>
      <Home.List>
        <Home.EndpointItem path="GET /api/users">
          Uses Zod (UserSchema) + TypeScript (PaginationParams)
        </Home.EndpointItem>
        <Home.EndpointItem path="POST /api/users">
          Uses Zod (CreateUserSchema) + YAML (Role reference)
        </Home.EndpointItem>
        <Home.EndpointItem path="GET /api/products">Uses Zod schemas</Home.EndpointItem>
        <Home.EndpointItem path="GET /api/orders">Uses TypeScript types</Home.EndpointItem>
        <Home.EndpointItem path="GET /api/roles">Uses custom YAML schema</Home.EndpointItem>
        <Home.EndpointItem path="GET /api/metadata">Uses custom YAML schema</Home.EndpointItem>
      </Home.List>
      <Home.Actions>
        <Home.DocsLink>View API Documentation →</Home.DocsLink>
      </Home.Actions>
    </Home.Frame>
  );
}
