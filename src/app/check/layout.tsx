import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Golden Hour — is this a scam?",
  description: "Paste a message, website or phone number. Golden Hour checks it for the warning signs of recovery scams, fake investments and 'digital arrest' calls — privately, on your device.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
