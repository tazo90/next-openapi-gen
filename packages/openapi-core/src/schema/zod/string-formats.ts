import { isRegisteredFormat } from "../../openapi/registries/index.js";
import type { OpenApiSchema } from "../../shared/types.js";

const UNREGISTERED_FORMAT_PATTERNS: Record<string, string> = {
  cuid: "^c[^\\s-]{8,}$",
  cuid2: "^[0-9a-z]+$",
  ulid: "^[0-9A-HJKMNP-TV-Z]{26}$",
  nanoid: "^[A-Za-z0-9_-]{21}$",
  jwt: "^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$",
  hex: "^[0-9a-fA-F]+$",
  e164: "^\\+[1-9]\\d{1,14}$",
  xid: "^[0-9a-v]{20}$",
  ksuid: "^[0-9A-Za-z]{27}$",
};

export type UnregisteredFormatReporter = (formatName: string) => void;

export function applyZodStringFormat(
  schema: OpenApiSchema,
  formatName: string,
  onUnregistered?: UnregisteredFormatReporter,
): OpenApiSchema {
  switch (formatName) {
    case "email":
    case "hostname":
    case "uuid":
    case "date":
    case "time":
    case "duration":
    case "ipv4":
    case "ipv6":
    case "uri":
    case "int32":
    case "int64":
    case "float":
    case "double":
      schema.format = formatName;
      return schema;
    case "uuidv4":
    case "uuidv6":
    case "uuidv7":
    case "guid":
      schema.format = "uuid";
      return schema;
    case "url":
    case "httpUrl":
      schema.format = "uri";
      return schema;
    case "datetime":
    case "iso.datetime":
      schema.format = "date-time";
      return schema;
    case "iso.date":
      schema.format = "date";
      return schema;
    case "iso.time":
      schema.format = "time";
      return schema;
    case "iso.duration":
      schema.format = "duration";
      return schema;
    case "cidrv4":
      schema.format = "ipv4-cidr";
      return schema;
    case "cidrv6":
      schema.format = "ipv6-cidr";
      return schema;
    case "ip":
      return {
        anyOf: [
          { type: "string", format: "ipv4" },
          { type: "string", format: "ipv6" },
        ],
      };
    case "cidr":
      return {
        anyOf: [
          { type: "string", format: "ipv4-cidr" },
          { type: "string", format: "ipv6-cidr" },
        ],
      };
    case "base64":
      delete schema.format;
      schema.contentEncoding = "base64";
      return schema;
    case "base64url":
      delete schema.format;
      schema.contentEncoding = "base64url";
      return schema;
    case "byte":
      delete schema.format;
      schema.contentEncoding = "base64";
      return schema;
    case "binary":
      delete schema.format;
      schema.contentMediaType = "application/octet-stream";
      return schema;
    default:
      break;
  }

  if (isRegisteredFormat(formatName)) {
    schema.format = formatName;
    return schema;
  }

  onUnregistered?.(formatName);
  delete schema.format;
  const pattern = UNREGISTERED_FORMAT_PATTERNS[formatName];
  if (pattern && !schema.pattern) {
    schema.pattern = pattern;
  }
  return schema;
}
