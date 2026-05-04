export type AliveResponse = {
  /** @example "alive" */
  status: string;
  /** @format date-time @example "2025-11-26T22:00:00.000Z" */
  timestamp: string;
  /** Process uptime in seconds @example 123.45 */
  uptime: number;
};
