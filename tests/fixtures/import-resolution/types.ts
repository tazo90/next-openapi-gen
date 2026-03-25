import { getUser } from "./helper.js";

export type UserResponse = Awaited<ReturnType<typeof getUser>>;