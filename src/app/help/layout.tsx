import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Golden Hour — help in simple words",
  description: "Crypto taken from your wallet? A calm, step-by-step guide for anyone — including how to find your transaction ID in MetaMask, Trust Wallet and more.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
