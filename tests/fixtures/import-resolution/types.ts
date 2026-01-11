import { getUser } from "./helper";

export type UserResponse = Awaited<ReturnType<typeof getUser>>;