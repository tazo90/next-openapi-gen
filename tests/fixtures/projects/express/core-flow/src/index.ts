import express from "express";
import type { UpdateUserInput, User, UserIdParams, ReportIdParams, ReportSummary } from "./schemas/models";

const app = express();

/**
 * Load a single user.
 * @operationId expressGetUserById
 * @pathParams UserIdParams
 * @response User
 * @tag Users
 * @responseSet auth
 * @openapi
 */
app.get("/users/:id", (_req, res) => res.json({}));

/**
 * Update a single user.
 * @operationId expressUpdateUserById
 * @pathParams UserIdParams
 * @body UpdateUserInput
 * @response User
 * @tag Users
 * @responseSet auth
 * @openapi
 */
app.post("/users/:id", (_req, res) => res.json({}));

/**
 * Load a report summary.
 * @operationId expressGetReportSummary
 * @pathParams ReportIdParams
 * @response ReportSummary
 * @tag Reports
 * @responseSet common
 * @openapi
 */
app.get("/reports/:reportId/summary", (_req, res) => res.json({}));

export default app;
