import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://wembyvshorford.com"),
  title: "The Win Share Index — Victor Wembanyama vs. Al Horford",
  description: "A live career win shares ledger tracking Victor Wembanyama against Al Horford.",
  openGraph: {
    title: "Has Victor Wembanyama caught Al Horford? Not yet.",
    description: "The live career win shares ledger.",
    url: "/",
    siteName: "The Win Share Index",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
