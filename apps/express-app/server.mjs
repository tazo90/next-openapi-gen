import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const title = process.env.DOCS_TITLE ?? "API Documentation";

const server = createServer((request, response) => {
  const url = request.url ?? "/";
  if (url.startsWith("/openapi.json")) {
    response.setHeader("content-type", "application/json");
    response.end(readFileSync(join(root, "public", "openapi.json")));
    return;
  }

  if (url.startsWith("/api-docs")) {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(
      `<!doctype html><html><body><h1>${title}</h1><a href="/openapi.json">Download OpenAPI Document</a></body></html>`,
    );
    return;
  }

  response.statusCode = 404;
  response.end();
});

server.listen(port, "localhost");
