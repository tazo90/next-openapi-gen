import type { SchemaType } from "../shared/types.js";

import { INIT_FRAMEWORKS, type InitFramework } from "./framework.js";
import { UI_TYPES_WITH_NONE } from "./ui-registry.js";

export type UiType = (typeof UI_TYPES_WITH_NONE)[number];
export { INIT_FRAMEWORKS };

export type InitOptions = {
  framework?: InitFramework;
  ui?: UiType;
  docsUrl?: string;
  schema?: SchemaType;
  output?: string;
};
