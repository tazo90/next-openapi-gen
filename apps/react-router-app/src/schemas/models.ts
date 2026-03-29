export type ProjectIdParams = {
  projectId: string;
};

export interface ProjectMutationInput {
  name: string;
  visibility: "private" | "public";
}

export interface Project {
  id: string;
  name: string;
  visibility: "private" | "public";
}

export interface ProfileSettings {
  theme: "light" | "dark";
  locale: string;
}
