export type ExportIdParam = {
  exportId: string;
};

export type ExportDownloadQuery = {
  format?: "csv" | "ndjson";
};

export type CsvExportBody = string;

export interface SessionIdParam {
  sessionId: string;
}

export interface SessionOperationMeta {
  requestId: string;
  refreshed: boolean;
}

export interface Envelope<T, TMeta = SessionOperationMeta> {
  data: T;
  meta: TMeta;
}

export interface SessionResource {
  id: string;
  userId: string;
  authChannel: "bearer" | "header" | "cookie";
  device: string;
  ipAddress: string;
  lastSeenAt: string;
  status: "active" | "revoked";
}

export interface SessionActionInput {
  extendMinutes?: number;
  revokeReason?: string;
}

export type SessionEnvelope = Envelope<SessionResource>;
