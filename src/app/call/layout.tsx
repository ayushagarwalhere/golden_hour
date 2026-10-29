import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Golden Hour — talk to a helper",
  description: "Call the Golden Hour helper, any time. It listens, comforts you, asks a few simple questions and writes your police report and freeze letters.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
