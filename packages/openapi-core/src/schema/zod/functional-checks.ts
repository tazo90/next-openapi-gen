/** Maps Zod Mini functional check names to classic chain method names. */
export const FUNCTIONAL_CHECK_TO_CHAIN_METHOD: Record<string, string> = {
  minLength: "min",
  maxLength: "max",
  length: "length",
  minSize: "minSize",
  maxSize: "maxSize",
  size: "length",
  gte: "min",
  minimum: "min",
  gt: "min",
  lte: "max",
  maximum: "max",
  lt: "max",
  lowercase: "toLowerCase",
  uppercase: "toUpperCase",
  normalize: "trim",
};

/** Format helpers that can appear as zero-arg functional checks inside `.check()`. */
export const FUNCTIONAL_FORMAT_CHECKS = new Set([
  "email",
  "url",
  "uri",
  "uuid",
  "uuidv4",
  "uuidv6",
  "uuidv7",
  "guid",
  "cuid",
  "cuid2",
  "ipv4",
  "ipv6",
  "datetime",
  "date",
  "time",
  "duration",
  "ulid",
  "nanoid",
  "jwt",
  "xid",
  "ksuid",
  "hostname",
  "hex",
  "hash",
  "base64",
  "base64url",
  "emoji",
  "ip",
  "cidr",
  "cidrv4",
  "cidrv6",
  "e164",
  "httpUrl",
]);

/** Mutations inside `.check()` that do not change the wire shape. */
export const FUNCTIONAL_NOOP_CHECKS = new Set([
  "trim",
  "toLowerCase",
  "toUpperCase",
  "overwrite",
  "normalize",
]);

/** Functional wrapper helpers at the top level (`z.readonly(inner)`, etc.). */
export const FUNCTIONAL_WRAPPER_HELPERS = new Set([
  "extend",
  "readonly",
  "default",
  "prefault",
  "catch",
  "describe",
]);
