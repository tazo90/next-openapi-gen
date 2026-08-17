import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Scalar API Docs",
  description: "Example Next.js API documented with Scalar and next-openapi-gen",
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
