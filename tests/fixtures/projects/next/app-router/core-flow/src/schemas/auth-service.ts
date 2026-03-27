export type AuthenticatedUser = {
  id: string;
  email: string;
  role: "owner" | "admin" | "member";
};

export type AuthResult =
  | {
      ok: true;
      user: AuthenticatedUser;
    }
  | {
      ok: false;
      reason: "missing-token" | "invalid-token";
    };

export async function getCurrentUserForRequest(accessToken?: string): Promise<AuthResult> {
  if (!accessToken) {
    return {
      ok: false,
      reason: "missing-token",
    };
  }

  return {
    ok: true,
    user: {
      id: "user_123",
      email: "owner@example.com",
      role: "owner",
    },
  };
}
