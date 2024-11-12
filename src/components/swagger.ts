export const swaggerDeps = ["swagger-ui", "swagger-ui-react"];

export function SwaggerUI(outputFile: string) {
  return `
import "swagger-ui-react/swagger-ui.css";

import dynamic from "next/dynamic";

const SwaggerUI = dynamic(() => import("swagger-ui-react"), {
  ssr: false,
  loading: () => <p>Loading Component...</p>,
});

export default async function ApiDocsPage() {
  return (
    <section>
      <SwaggerUI url="/${outputFile}" />
    </section>
  );
}
`;
}
