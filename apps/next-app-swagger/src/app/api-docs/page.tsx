"use client";

import "swagger-ui-dist/swagger-ui.css";

import { useEffect, useRef } from "react";

type SwaggerUiBundle = {
  (options: {
    deepLinking?: boolean;
    domNode: Element;
    layout?: string;
    presets?: unknown[];
    url: string;
  }): void;
  presets: {
    apis: unknown;
  };
};

export default function ApiDocsPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;

    const loadSwaggerUi = async () => {
      const [{ default: SwaggerUIBundle }, { default: SwaggerUIStandalonePreset }] =
        await Promise.all([
          import("swagger-ui-dist/swagger-ui-bundle"),
          import("swagger-ui-dist/swagger-ui-standalone-preset"),
        ]);

      if (!isMounted || !containerRef.current) {
        return;
      }

      (SwaggerUIBundle as SwaggerUiBundle)({
        url: "/openapi.json",
        domNode: containerRef.current,
        deepLinking: true,
        presets: [(SwaggerUIBundle as SwaggerUiBundle).presets.apis, SwaggerUIStandalonePreset],
        layout: "BaseLayout",
      });
    };

    void loadSwaggerUi();

    return () => {
      isMounted = false;
      containerRef.current?.replaceChildren();
    };
  }, []);

  return <div ref={containerRef} />;
}
