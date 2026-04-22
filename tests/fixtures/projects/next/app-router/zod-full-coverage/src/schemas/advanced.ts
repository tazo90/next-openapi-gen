import { z } from "zod/v4";

export const PromisedString = z.promise(z.string());

export const Transformed = z.string().transform((value) => value.trim());

export const Refined = z.number().refine((value) => value % 2 === 0, { message: "must be even" });

type LazyNode = {
  value: string;
  children: LazyNode[];
};

export const LazyTree: z.ZodType<LazyNode> = z.lazy(() =>
  z.object({
    value: z.string(),
    children: z.array(LazyTree),
  }),
);
