import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lightly",
  description: "Book time with Mattis Erngren.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
