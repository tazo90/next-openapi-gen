declare module "swagger-ui-dist/swagger-ui-bundle" {
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

  const SwaggerUIBundle: SwaggerUiBundle;

  export default SwaggerUIBundle;
}

declare module "swagger-ui-dist/swagger-ui-standalone-preset" {
  const SwaggerUIStandalonePreset: unknown;

  export default SwaggerUIStandalonePreset;
}
