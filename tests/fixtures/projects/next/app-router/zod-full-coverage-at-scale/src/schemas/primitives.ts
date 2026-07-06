import { z } from "zod/v4";

export const StringFormatsSchema = z.object({
  uuid: z.uuid(),
  email: z.email(),
  url: z.url(),
  cuid: z.cuid(),
  cuid2: z.string().cuid2(),
  ulid: z.string().ulid(),
  nanoid: z.string().nanoid(),
  jwt: z.string().jwt(),
  base64: z.string().base64(),
  base64url: z.string().base64url(),
  ip: z.string().ip(),
  cidr: z.string().cidr(),
  e164: z.string().e164(),
  datetime: z.iso.datetime(),
  date: z.iso.date(),
  time: z.iso.time(),
  duration: z.iso.duration(),
  regex: z.string().regex(/^[a-z]+$/),
  minLen: z.string().min(3),
  maxLen: z.string().max(20),
  lenFixed: z.string().length(10),
  startsWith: z.string().startsWith("api-"),
  endsWith: z.string().endsWith("-prod"),
  nonempty: z.string().nonempty(),
  upper: z.string().toUpperCase(),
  lower: z.string().toLowerCase(),
});

export const NumberRefinementsSchema = z.object({
  int: z.number().int(),
  positive: z.number().positive(),
  nonneg: z.number().nonnegative(),
  negative: z.number().negative(),
  nonpos: z.number().nonpositive(),
  safe: z.number().safe(),
  finite: z.number().finite(),
  bounded: z.number().min(0).max(100),
  step: z.number().multipleOf(0.5),
  bigint: z.bigint(),
});

export const ScalarsSchema = z.object({
  bool: z.boolean(),
  date: z.date(),
  any: z.any(),
  unknown: z.unknown(),
  file: z.instanceof(File).optional(),
  url: z.instanceof(URL).optional(),
  regex: z.instanceof(RegExp).optional(),
});
