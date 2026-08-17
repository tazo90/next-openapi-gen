import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Zod API",
  description: "Example Next.js API using Zod schemas with next-openapi-gen",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
