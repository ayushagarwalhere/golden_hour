"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useT } from "@/lib/prefs";

const ease = [0.22, 1, 0.36, 1] as const;

/** Headline words that rise into place one by one. */
export function Words({ text, delay = 0 }: { text: string; delay?: number }) {
  return (
    <>
      {text.split(" ").map((w, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.12em] align-bottom">
          <motion.span className="inline-block" initial={{ y: "110%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 1.3, ease, delay: delay + i * 0.08 }}>
            {w}&nbsp;
          </motion.span>
        </span>
      ))}
    </>
  );
}

export function Nav({ right }: { right?: React.ReactNode }) {
  const t = useT();
  return (
    <header
      className="fixed inset-x-0 top-0 z-30 flex items-center justify-between px-5 py-5 md:px-10"
      style={{
        background: "linear-gradient(to bottom, rgba(22,12,28,0.85), rgba(22,12,28,0.45) 60%, transparent)",
        backdropFilter: "blur(6px)",
        WebkitMaskImage: "linear-gradient(to bottom, black 70%, transparent)",
      }}
    >
      <Link href="/" className="flex items-center gap-3">
        <span className="block h-3 w-3 rounded-full" style={{ background: "radial-gradient(circle, #fff1d8, #ffd29a 50%, #f0a35e)", boxShadow: "0 0 18px 4px rgba(255,190,120,0.5)" }} />
        <span className="serif text-xl">Golden Hour</span>
      </Link>
      {right ?? (
        <Link className="btn btn-ghost btn-sm" href="/#begin">
          {t("nav.help")}
        </Link>
      )}
    </header>
  );
}

export function Footer() {
  const t = useT();
  return (
    <footer className="relative z-10 flex flex-col items-center gap-3 px-5 pb-10 text-center text-sm" style={{ color: "var(--faint)" }}>
      <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2" aria-label="Footer">
        <Link className="hover:underline" href="/call">
          {t("call.title")}
        </Link>
        <Link className="hover:underline" href="/check">
          {t("nav.check")}
        </Link>
        <Link className="hover:underline" href="/help">
          {t("a.guide")}
        </Link>
        <Link className="hover:underline" href="/verify">
          {t("foot.verify")}
        </Link>
        <Link className="hover:underline" href="/about">
          {t("foot.about")}
        </Link>
        <Link className="hover:underline" href="/judge">
          {t("foot.judge")}
        </Link>
      </nav>
      <p className="max-w-2xl">{t("foot.note")}</p>
    </footer>
  );
}
