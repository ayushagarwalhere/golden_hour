"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useT } from "@/lib/prefs";

/** A 4-in / 4-out breathing guide shown while the trace runs. Matches the sun's 8s pulse. */
export default function Breathing({ log }: { log: string[] }) {
  const t = useT();
  const [phase, setPhase] = useState<"in" | "out">("in");
  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p === "in" ? "out" : "in")), 4000);
    return () => clearInterval(id);
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-40 flex flex-col items-center justify-center px-6"
      style={{ background: "radial-gradient(60% 60% at 50% 45%, rgba(22,12,28,0.35), rgba(22,12,28,0.82))" }}
      role="status"
      aria-live="polite"
    >
      <div className="relative flex items-center justify-center" style={{ width: 260, height: 260 }}>
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 150,
            height: 150,
            background: "radial-gradient(circle at 40% 35%, #fff4dd, #ffd29a 40%, #f0a35e 70%, rgba(208,96,63,0.0) 72%)",
            filter: "blur(0.5px)",
            boxShadow: "0 0 120px 40px rgba(255,190,120,0.25)",
          }}
          animate={{ scale: phase === "in" ? 1.45 : 0.9 }}
          transition={{ duration: 4, ease: [0.45, 0, 0.55, 1] }}
        />
        <motion.div
          className="absolute rounded-full border"
          style={{ width: 230, height: 230, borderColor: "rgba(255,210,154,0.22)" }}
          animate={{ scale: phase === "in" ? 1.08 : 0.94, opacity: phase === "in" ? 0.9 : 0.4 }}
          transition={{ duration: 4, ease: [0.45, 0, 0.55, 1] }}
        />
        <AnimatePresence mode="wait">
          <motion.span
            key={phase}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.9 }}
            className="serif italic relative text-2xl"
            style={{ color: "#3a1626" }}
          >
            {phase === "in" ? t("b.in") : t("b.out")}
          </motion.span>
        </AnimatePresence>
      </div>
      <p className="serif mt-10 text-center text-3xl md:text-4xl">{t("b.title")}</p>
      <p className="mt-3 max-w-md text-center" style={{ color: "var(--mist)" }}>
        {t("b.sub")}
      </p>
      <div className="mono mt-8 h-28 w-full max-w-xl overflow-hidden text-[12px] leading-6" style={{ maskImage: "linear-gradient(to bottom, transparent, black 35%)" }}>
        <div className="flex flex-col justify-end" style={{ minHeight: "100%" }}>
          <AnimatePresence initial={false}>
            {log.slice(-5).map((l, i) => (
              <motion.div
                key={l + i + log.length}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                style={{ color: "var(--mist)" }}
              >
                <span style={{ color: "var(--gold)" }}>›</span> {l}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
