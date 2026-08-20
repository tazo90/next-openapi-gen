import { Hono } from "hono";
import type { UpdateUserInput, User, UserIdParams, ReportIdParams, ReportSummary } from "./schemas/models";

const app = new Hono();

/**
 * Load a single user.
 * @operationId honoGetUserById
 * @pathParams UserIdParams
 * @response User
 * @tag Users
 * @responseSet auth
 * @openapi
 */
app.get("/users/:id", (c) => c.json({}));

/**
 * Update a single user.
 * @operationId honoUpdateUserById
 * @pathParams UserIdParams
 * @body UpdateUserInput
 * @response User
 * @tag Users
 * @responseSet auth
 * @openapi
 */
app.post("/users/:id", (c) => c.json({}));

/**
 * Load a report summary.
 * @operationId honoGetReportSummary
 * @pathParams ReportIdParams
 * @response ReportSummary
 * @tag Reports
 * @responseSet common
 * @openapi
 */
app.get("/reports/:reportId/summary", (c) => c.json({}));

export default app;
