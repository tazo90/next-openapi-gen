import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OpenAPI Sandbox",
  description: "Example Next.js API demonstrating next-openapi-gen OpenAPI documentation",
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
