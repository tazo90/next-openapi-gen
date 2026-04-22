/**
 * Admin-reports domain types — showcases conditional types,
 * `keyof`, indexed access, template-literal enums, and
 * `Awaited<ReturnType<...>>`.
 */

export type ReportKind = "financial" | "usage" | "audit";

export type ReportFormat = "csv" | "json" | "parquet";

/**
 * Template literal combining kind + format.
 */
export type ReportFilename = `${ReportKind}-${string}.${ReportFormat}`;

/**
 * `keyof` + indexed access.
 */
export type AdminReport = {
  id: string;
  kind: ReportKind;
  title: string;
  format: ReportFormat;
  requestedBy: string;
  requestedAt: string;
};

export type AdminReportKey = keyof AdminReport;
export type AdminReportValue = AdminReport[AdminReportKey];

/**
 * Conditional type — picks only the timestamp-ish fields.
 */
export type TimestampFields<T> = {
  [K in keyof T]: T[K] extends string ? (K extends `${string}At` ? T[K] : never) : never;
};

/**
 * Promise-returning function exercising `Awaited<ReturnType<...>>`.
 */
export async function loadReportManifest() {
  return {
    version: 1 as const,
    generatedAt: new Date().toISOString(),
    kinds: ["financial", "usage", "audit"] as const,
  };
}

export type ReportManifest = Awaited<ReturnType<typeof loadReportManifest>>;

export type CreateAdminReportBody = {
  kind: ReportKind;
  format: ReportFormat;
  /**
   * @openapi-override { "format": "email", "maxLength": 320 }
   */
  notify: string;
};

export type AdminReportsResponse = {
  data: AdminReport[];
  manifest: ReportManifest;
};
