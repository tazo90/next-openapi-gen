export type UserIdParams = {
  id: string;
};

export interface UpdateUserInput {
  email?: string;
  name?: string;
}

export interface User {
  id: string;
  email: string;
  role: "admin" | "member";
}

export type ReportIdParams = {
  reportId: string;
};

export interface ReportSummary {
  id: string;
  title: string;
  status: "draft" | "published";
  updatedAt: string;
}

export interface AssetUploadInput {
  fileName: string;
  kind: "avatar" | "report";
}

export interface AssetUpload {
  id: string;
  kind: "avatar" | "report";
  url: string;
}
