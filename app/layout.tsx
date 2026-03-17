import type { Metadata } from "next";

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
  return children;
}
