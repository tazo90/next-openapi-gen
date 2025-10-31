import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Drizzle-Zod Blog API",
  description:
    "Example Next.js API with Drizzle ORM, Zod validation, and OpenAPI documentation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
