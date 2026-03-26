declare module "swagger-ui-react" {
  import type { ComponentType } from "react";

  type SwaggerUIProps = {
    url?: string;
  };

  const SwaggerUI: ComponentType<SwaggerUIProps>;

  export default SwaggerUI;
}
