export type UserIdParamsSchema = {
  id: string;
};

export type UserQuerySchema = {
  includeAudit?: boolean;
};

export interface UpdateUserSchema {
  name?: string;
  email?: string;
}

export interface UserSchema {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}
