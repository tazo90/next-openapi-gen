export type LoginBody = {
  email: string; // user email
  password: string; // user password
};

export type LoginResponse = {
  token: string; // auth token
  refresh_token: string; // refresh token
};
