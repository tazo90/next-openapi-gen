import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TypeScript API",
  description: "Example Next.js API using TypeScript types with next-openapi-gen",
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
