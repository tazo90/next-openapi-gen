import { createFileRoute } from "@tanstack/react-router";

import * as Home from "../home";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <Home.Frame>
      <Home.Header>TanStack Router API</Home.Header>
      <Home.Lead>Open the generated API documentation at /api-docs.</Home.Lead>
    </Home.Frame>
  );
}
