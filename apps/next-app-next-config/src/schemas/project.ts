export type ProjectRecordIdParams = {
  id: string;
};

export interface UpdateProjectRecordInput {
  name?: string;
  visibility?: "private" | "public";
}

export interface ProjectRecord {
  id: string;
  name: string;
  visibility: "private" | "public";
}

export type ProjectShareIdParams = {
  id: string;
};
