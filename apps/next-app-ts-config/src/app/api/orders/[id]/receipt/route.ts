import type { OrderReceiptBody, OrderReceiptIdParams } from "@/schemas/order";

type OrderReceiptRouteContext = {
  params: Promise<OrderReceiptIdParams>;
};

/**
 * Download an order receipt.
 * @description Demonstrates typed-config discovery with a non-JSON receipt response.
 * @pathParams OrderReceiptIdParams
 * @response OrderReceiptBody
 * @responseContentType text/plain
 * @tag Orders
 * @operationId tsConfigDownloadOrderReceipt
 * @openapi
 */
export async function GET(_request: Request, { params }: OrderReceiptRouteContext) {
  const { id } = await params;
  const body = `Receipt ${id}\nstatus: paid\ntotalCents: 4200\n` satisfies OrderReceiptBody;

  return new Response(body, {
    headers: {
      "content-type": "text/plain",
    },
    status: 200,
  });
}
