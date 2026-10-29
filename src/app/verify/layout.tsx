import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Golden Hour — verify an evidence file",
  description: "Check that a Golden Hour evidence file hasn't been altered. Runs entirely in your browser.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
