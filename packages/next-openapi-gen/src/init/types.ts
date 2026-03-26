export type UiType = "scalar" | "swagger" | "redoc" | "stoplight" | "rapidoc" | "none";

export type InitOptions = {
  ui?: UiType;
  docsUrl?: string;
  schema?: "zod" | "typescript";
  output?: string;
};
