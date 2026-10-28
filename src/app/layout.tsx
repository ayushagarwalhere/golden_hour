import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { AccessBar } from "@/components/Access";
import { PrefsProvider } from "@/lib/prefs";

const sans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });
const serif = Instrument_Serif({ variable: "--font-serif", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: "Golden Hour — the next hour matters",
  description:
    "Crypto stolen? Golden Hour follows your funds across the blockchain to the exchange that received them, and drafts the freeze request and police report — in minutes.",
};

export const viewport: Viewport = { themeColor: "#160c1c" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-text="normal">
      <body className={`${sans.variable} ${mono.variable} ${serif.variable}`}>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-full focus:bg-[#ffd29a] focus:px-4 focus:py-2 focus:text-[#2a1020]">
          Skip to main content
        </a>
        <PrefsProvider>
          {children}
          <AccessBar />
        </PrefsProvider>
      </body>
    </html>
  );
}
