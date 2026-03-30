export type UserIdParams = {
  id: string;
};

export type UserFieldsQuery = {
  include?: "profile" | "permissions";
  verbose?: boolean;
};

export interface UpdateUserBody {
  name: string;
  email?: string;
  active?: boolean;
}

export interface UserDetail {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

export type ReportIdParams = {
  id: string;
};

export interface ReportSummary {
  id: string;
  generatedAt: Date;
}

export interface ReportsList {
  data: ReportSummary[];
}
