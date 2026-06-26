import type {
  BillingCookies,
  BillingRequestHeaders,
  CreateInvoiceBody,
  InvoiceQuery,
  InvoicesResponse,
} from "@/types/billing";
import { NextRequest, NextResponse } from "next/server";

/**
 * List invoices
 * @summary List invoices
 * @description Returns a paginated list of invoices. Exercises wildcard responses and `@link`.
 * @tag Billing
 * @tags Finance
 * @params InvoiceQuery
 * @header BillingRequestHeaders
 * @cookie BillingCookies
 * @response InvoicesResponse
 * @response 4XX:ErrorResponse:Any client error
 * @response default:ErrorResponse:Fallback error envelope
 * @responseHeader 200 Link string RFC 5988 pagination links
 * @responseHeader 200 X-Total-Count integer Total invoices matching the query
 * @link 200 getInvoice tsGetInvoice
 * @auth bearer
 * @operationId tsListInvoices
 * @openapi
 */
export async function GET(_request: NextRequest) {
  return NextResponse.json({});
}

/**
 * Create invoice
 * @summary Create invoice
 * @description Creates a new draft invoice.
 * @tag Billing
 * @body CreateInvoiceBody
 * @header BillingRequestHeaders
 * @response 201:Invoice:Draft invoice created
 * @responseHeader 201 Location string URL of the created invoice
 * @link 201 getInvoice tsGetInvoice
 * @auth bearer
 * @operationId tsCreateInvoice
 * @openapi
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json({}, { status: 201 });
}
