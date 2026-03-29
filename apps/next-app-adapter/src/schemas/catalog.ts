export type CatalogItemIdParams = {
  id: string;
};

export interface UpdateCatalogItemInput {
  name?: string;
  status?: "active" | "archived";
}

export interface CatalogItem {
  id: string;
  name: string;
  status: "active" | "archived";
}
