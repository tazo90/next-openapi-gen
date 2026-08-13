import { ApiDocsView } from "./api-docs-view";

export default function ApiDocsPage() {
  return (
    <main>
      <h1 data-testid="api-docs-shell-marker" className="sr-only">
        Drizzle-Zod Blog API
      </h1>
      <ApiDocsView />
    </main>
  );
}
