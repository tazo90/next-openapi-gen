export enum ROLE {
  OWNER,
  MEMBER,
}

// Define path parameter type
export type UserIdParam = {
  id: string; // User's unique identifier
};

export type UserAddress = {
  line1: string;
  line2?: string;
  city: string;
  postalCode: string;
};

export interface User {
  id: string;
  email: string;
  name: string;
  password: string;
  role: "admin" | "user";
  address: UserAddress;
  createdAt: Date;
  updatedAt: Date;
  internalNotes?: string;
}

export type UserRegisterRequest = Pick<User, "email" | "name" | "password">;

export type UserResponse = Omit<User, "password" | "internalNotes">;
