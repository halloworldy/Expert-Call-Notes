import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PE Diligence Notes",
  description: "Expert call note management for private equity diligence",
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
