import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Swagger API Docs",
  description: "Example Next.js API documented with Swagger UI and next-openapi-gen",
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
