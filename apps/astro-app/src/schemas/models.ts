export type UserIdParams = { id: string };
export interface User {
  id: string;
  email: string;
}
export interface UpdateUserInput {
  email?: string;
}
