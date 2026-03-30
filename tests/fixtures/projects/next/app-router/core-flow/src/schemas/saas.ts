import { getCurrentUserForRequest } from "./auth-service";

export type WorkspaceMemberPathParams = {
  workspaceId: string;
  memberId: string;
};

export type WorkspaceMemberViewQuery = {
  include?: "permissions" | "activity";
  audit?: boolean;
};

export interface WorkspaceMemberProfile {
  id: string;
  workspaceId: string;
  email: string;
  role: "owner" | "admin" | "member";
  active: boolean;
}

export interface UpdateWorkspaceMemberBody {
  role?: "owner" | "admin" | "member";
  active?: boolean;
}

export interface CreateBillingPortalSessionBody {
  returnUrl: string;
}

export interface BillingPortalSession {
  url: string;
  expiresAt: Date;
}

export interface AvatarUploadFormData {
  file: File;
  description?: string;
  category: string;
}

export interface UploadedAsset {
  id: string;
  url: string;
  category: string;
}

export interface ConflictResponse {
  message: string;
  code: "CONFLICT";
}

export interface RateLimitResponse {
  message: string;
  retryAfterSeconds: number;
}

export interface ProductSummary {
  id: string;
  name: string;
}

export interface ProductListResponse {
  data: ProductSummary[];
}

export type CurrentUserResponse = Awaited<ReturnType<typeof getCurrentUserForRequest>>;
