/**
 * Health check response (defined in a separate types directory)
 */
export type HealthCheckResponse = {
  /** Service health status */
  status: "healthy" | "degraded" | "unhealthy";
  /** Server uptime in seconds */
  uptime: number;
  /** Timestamp of the check */
  timestamp: string;
};
