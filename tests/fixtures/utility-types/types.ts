// User type for testing
export interface User {
  name: string;
  email: string;
}

// For testing Awaited - define explicit promise-like types
export type UserPromise = Promise<User>;
export type NestedUserPromise = Promise<Promise<User>>;

// Awaited tests
export type AwaitedUser = Awaited<UserPromise>;
export type AwaitedNestedUser = Awaited<NestedUserPromise>;
export type AwaitedRegularType = Awaited<User>;

// Function declarations for ReturnType tests
export async function getUserNameById(
  id: number
): Promise<{ name: string; firstName: string }> {
  return {
    name: "John Doe",
    firstName: "John",
  };
}

export function createUser(name: string): { id: number; name: string } {
  return { id: 1, name };
}

// Function without return type annotation (should trigger warning)
export async function noAnnotationFunction(id: number) {
  return { data: "test" };
}

// Arrow function with explicit return type
export const getEmail = (userId: number): { email: string } => {
  return { email: "test@example.com" };
};

// ReturnType tests
export type UserNameByIdResponse = ReturnType<typeof getUserNameById>;
export type CreateUserResponse = ReturnType<typeof createUser>;
export type NoAnnotationResponse = ReturnType<typeof noAnnotationFunction>;
export type EmailResponse = ReturnType<typeof getEmail>;

// Nested utility types - the main bug example
export type AwaitedReturnType = Awaited<ReturnType<typeof getUserNameById>>;

// Parameters tests
export function createUserWithParams(
  userData: { name: string },
  options: { email: string }
): User {
  return { name: userData.name, email: options.email };
}

export type CreateUserParams = Parameters<typeof createUserWithParams>;
export type FirstParam = Parameters<typeof createUserWithParams>[0];
export type SecondParam = Parameters<typeof createUserWithParams>[1];

// Indexed access tests
export type UserNameProperty = User["name"];
export type UserEmailProperty = User["email"];
