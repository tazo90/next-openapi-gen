export default function Home() {
  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Mixed Schema Types API Example</h1>
      <p>
        This example demonstrates using <strong>multiple schema types</strong>{" "}
        simultaneously:
      </p>
      <ul>
        <li>
          <strong>Zod schemas</strong> - UserSchema, ProductSchema (
          <code>src/schemas/zod-schemas.ts</code>)
        </li>
        <li>
          <strong>TypeScript types</strong> - Order, OrderItem, PaginationParams
          (<code>src/schemas/typescript-types.ts</code>)
        </li>
        <li>
          <strong>Custom YAML schemas</strong> - Role, Permission, ApiMetadata (
          <code>src/schemas/custom-schemas.yaml</code>)
        </li>
      </ul>
      <h2>API Endpoints:</h2>
      <ul>
        <li>
          <code>GET /api/users</code> - Uses Zod (UserSchema) + TypeScript
          (PaginationParams)
        </li>
        <li>
          <code>POST /api/users</code> - Uses Zod (CreateUserSchema) + YAML
          (Role reference)
        </li>
        <li>
          <code>GET /api/products</code> - Uses Zod schemas
        </li>
        <li>
          <code>GET /api/orders</code> - Uses TypeScript types
        </li>
        <li>
          <code>GET /api/roles</code> - Uses custom YAML schema
        </li>
        <li>
          <code>GET /api/metadata</code> - Uses custom YAML schema
        </li>
      </ul>
      <div style={{ marginTop: "2rem" }}>
        <a
          href="/api-docs"
          style={{
            display: "inline-block",
            padding: "0.75rem 1.5rem",
            backgroundColor: "#0070f3",
            color: "white",
            textDecoration: "none",
            borderRadius: "5px",
            fontWeight: "bold",
          }}
        >
          View API Documentation →
        </a>
      </div>
    </div>
  );
}
