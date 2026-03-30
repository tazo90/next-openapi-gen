export type OrderRecordIdParams = {
  id: string;
};

export interface UpdateOrderRecordInput {
  totalCents?: number;
  status?: "paid" | "refunded";
}

export interface OrderRecord {
  id: string;
  totalCents: number;
  status: "paid" | "refunded";
}

export type OrderReceiptIdParams = {
  id: string;
};

export type OrderReceiptBody = string;
