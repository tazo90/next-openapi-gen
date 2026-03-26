import { z } from "zod";

export const PaymentMethodSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("card").describe("Payment method type"),
    cardNumber: z
      .string()
      .regex(/^\d{4} \d{4} \d{4} \d{4}$/)
      .describe("Card number (format: XXXX XXXX XXXX XXXX)"),
    expiryDate: z
      .string()
      .regex(/^\d{2}\/\d{2}$/)
      .describe("Expiry date (format: MM/YY)"),
    cardholderName: z.string().describe("Cardholder's name"),
  }),
  z.object({
    type: z.literal("bankTransfer").describe("Payment method type"),
    accountNumber: z
      .string()
      .regex(/^\d{26}$/)
      .describe("Bank account number (26 digits)"),
    bankName: z.string().describe("Bank name"),
  }),
  z.object({
    type: z.literal("paypal").describe("Payment method type"),
    email: z.string().email().describe("Email address associated with PayPal"),
  }),
]);

export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
