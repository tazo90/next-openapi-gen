import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Next.js Pages Router + next-openapi-gen</h1>
      <p>
        This is an example demonstrating how to use{" "}
        <code>next-openapi-gen</code> with the Pages Router.
      </p>
      <p>
        <Link href="/api-docs" style={{ color: "#0070f3" }}>
          View API Documentation
        </Link>
      </p>
      <h2>Available Endpoints</h2>
      <ul>
        <li>
          <code>GET /api/users</code> - List all users
        </li>
        <li>
          <code>POST /api/users</code> - Create a new user
        </li>
        <li>
          <code>GET /api/users/[id]</code> - Get user by ID
        </li>
        <li>
          <code>PUT /api/users/[id]</code> - Update user
        </li>
        <li>
          <code>DELETE /api/users/[id]</code> - Delete user
        </li>
        <li>
          <code>GET /api/products</code> - List all products
        </li>
        <li>
          <code>POST /api/products</code> - Create a new product
        </li>
        <li>
          <code>GET /api/products/[id]</code> - Get product by ID
        </li>
        <li>
          <code>PUT /api/products/[id]</code> - Update product
        </li>
        <li>
          <code>DELETE /api/products/[id]</code> - Delete product
        </li>
      </ul>
    </main>
  );
}
