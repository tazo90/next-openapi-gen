export type ReportQuery = {
  from?: string; // start date (ISO 8601)
  to?: string; // end date (ISO 8601)
};

export type Report = {
  id: string;
  title: string;
  generatedAt: string;
};

export type ReportsResponse = {
  data: Report[];
  total: number;
};

export type CreateReportBody = {
  title: string;
  from: string; // start date (ISO 8601)
  to: string; // end date (ISO 8601)
};
