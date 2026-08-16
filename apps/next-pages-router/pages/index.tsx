import { Home } from "../components/home";

export default function HomePage() {
  return (
    <Home.Frame>
      <Home.Header>Next.js Pages Router + next-openapi-gen</Home.Header>
      <Home.Intro>
        This is an example demonstrating how to use <code>next-openapi-gen</code> with the Pages
        Router.
      </Home.Intro>
      <Home.Intro>
        <Home.DocsLink>View API Documentation</Home.DocsLink>
      </Home.Intro>
      <Home.Heading>Available Endpoints</Home.Heading>
      <Home.List>
        <Home.EndpointItem path="GET /api/users">List all users</Home.EndpointItem>
        <Home.EndpointItem path="POST /api/users">Create a new user</Home.EndpointItem>
        <Home.EndpointItem path="GET /api/users/[id]">Get user by ID</Home.EndpointItem>
        <Home.EndpointItem path="PUT /api/users/[id]">Update user</Home.EndpointItem>
        <Home.EndpointItem path="DELETE /api/users/[id]">Delete user</Home.EndpointItem>
        <Home.EndpointItem path="GET /api/products">List all products</Home.EndpointItem>
        <Home.EndpointItem path="POST /api/products">Create a new product</Home.EndpointItem>
        <Home.EndpointItem path="GET /api/products/[id]">Get product by ID</Home.EndpointItem>
        <Home.EndpointItem path="PUT /api/products/[id]">Update product</Home.EndpointItem>
        <Home.EndpointItem path="DELETE /api/products/[id]">Delete product</Home.EndpointItem>
      </Home.List>
    </Home.Frame>
  );
}
