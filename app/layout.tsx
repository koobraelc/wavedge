import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Wavedge - Know Everything About Crypto",
  description:
    "Aggregated crypto knowledge platform: prices, news, sentiment, on-chain data, and research.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
