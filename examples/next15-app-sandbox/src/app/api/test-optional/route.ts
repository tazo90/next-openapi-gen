import { z } from "zod";

/**
 * This is a test user endpoint
 * @description Test User Description
 * @response User
 * @openapi
 */
export const GET = async () =>
  Response.json(
    await User.parseAsync({
      name: "John Doe",
      profileImage: { url: "https://placehold.co/100x100" },
    })
  );

export const Image = z.object({
  url: z.string().describe("The url"),
});

export const User = z.object({
  name: z.string().describe("Full name of the user"),
  profileImage: Image.optional().describe("The profile image"),
  avatar: Image.nullable().describe("The avatar image"),
  banner: Image.nullish().describe("The banner image"),
});
