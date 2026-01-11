export interface User {
  name: string;
  email: string;
}

export async function getUser(id: number): Promise<User> {
  return { name: "John", email: "john@example.com" };
}