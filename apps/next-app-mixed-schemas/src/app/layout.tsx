import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mixed Schema Types API",
  description: "Example demonstrating Zod + TypeScript + Custom YAML schemas",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
