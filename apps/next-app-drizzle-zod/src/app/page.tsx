import Link from "next/link";

import { Home } from "./home";

export default function HomePage() {
  return (
    <Home.Frame>
      <Home.Header title="Drizzle-Zod Blog API">
        Example Next.js API with Drizzle ORM, Zod validation, and OpenAPI documentation
      </Home.Header>

      <Home.Section title="Features">
        <Home.FeatureList>
          <Home.Feature name="Drizzle ORM">
            Table schemas that drizzle-zod turns into Zod types
          </Home.Feature>
          <Home.Feature name="drizzle-zod">
            Auto-generated Zod schemas from Drizzle tables
          </Home.Feature>
          <Home.Feature name="next-openapi-gen">Automatic OpenAPI 3.0 documentation</Home.Feature>
          <Home.Feature name="Scalar UI">Modern API documentation interface</Home.Feature>
        </Home.FeatureList>
      </Home.Section>

      <Home.Section title="Quick Start">
        <div className="space-y-4">
          <Home.Step title="1. View API Documentation">
            <Link
              href="/api-docs"
              data-testid="api-docs-link"
              className="inline-block rounded-lg bg-blue-500 px-6 py-3 text-white transition-colors hover:bg-blue-600"
            >
              Open API Docs →
            </Link>
          </Home.Step>

          <Home.Step title="2. Try the API">
            <Home.CodeSample>curl http://localhost:3000/api/posts</Home.CodeSample>
          </Home.Step>

          <Home.Step title="3. Create a Post">
            <Home.CodeSample>
              {`curl -X POST http://localhost:3000/api/posts \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "My First Post",
    "slug": "my-first-post",
    "content": "Hello World!",
    "authorId": 1
  }'`}
            </Home.CodeSample>
          </Home.Step>
        </div>
      </Home.Section>

      <Home.Section title="Endpoints">
        <Home.EndpointList>
          <Home.GetEndpoint path="/api/posts">List all posts</Home.GetEndpoint>
          <Home.PostEndpoint path="/api/posts">Create a new post</Home.PostEndpoint>
          <Home.GetEndpoint path="/api/posts/[id]">Get post by ID</Home.GetEndpoint>
          <Home.PatchEndpoint path="/api/posts/[id]">Update post</Home.PatchEndpoint>
          <Home.DeleteEndpoint path="/api/posts/[id]">Delete post</Home.DeleteEndpoint>
        </Home.EndpointList>
      </Home.Section>
    </Home.Frame>
  );
}
