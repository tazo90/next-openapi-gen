import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <main>
      <h1>TanStack Router API</h1>
      <p>Open the generated API documentation at /api-docs.</p>
    </main>
  );
}
