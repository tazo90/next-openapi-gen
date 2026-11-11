export type AliveResponse = {
  /** @example "alive" */
  status: string;
  /** @format date-time @example "2025-11-26T22:00:00.000Z" */
  timestamp: string;
  /** Process uptime in seconds @example 123.45 */
  uptime: number;
};

export type CellResponse = {
  /** Column label. */
  col: string;
  value: string | null;
  /** Per-cell prompt override. */
  instructions: string | null;
  row: number;
  // ISO 8601 timestamp of the last edit.
  updatedAt: string;
  status: string; // Cell lifecycle status.
  error: string | null;
  /** The in-flight fill, if any (see {@link ActiveFill}). */
  fillId?: string;
  /** Where the value came from: {@link https://example.com/sources | a source}. */
  source?: string;
};
