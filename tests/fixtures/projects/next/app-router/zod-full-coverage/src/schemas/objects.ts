import { z } from "zod/v4";

const BaseShape = {
  id: z.string(),
  slug: z.string(),
};

export const BaseObject = z.object(BaseShape);

export const StrictObject = z.object({ ...BaseShape, name: z.string() }).strict();
export const PassthroughObject = z.object({ id: z.string() }).passthrough();
export const CatchAllObject = z.object({ id: z.string() }).catchall(z.string());
export const PickedObject = BaseObject.pick({ id: true });
export const OmittedObject = BaseObject.omit({ slug: true });
export const PartialObject = BaseObject.partial();
// .meta({ id }) overrides the component name in the generated OpenAPI spec
export const ExtendedObject = BaseObject.extend({ createdAt: z.iso.datetime() }).meta({
  id: "ExtendedBase",
});
export const MergedObject = BaseObject.merge(z.object({ active: z.boolean() }));
