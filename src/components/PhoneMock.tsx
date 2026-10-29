"use client";

import { motion } from "motion/react";

/** A simple drawn phone screen that shows where to tap. Not a real app — a picture to point at. */
export type MockRow = { text: string; sub?: string; right?: string; tap?: boolean; tone?: "danger" | "muted" };
export type MockScreen = { title: string; rows: MockRow[]; tabs?: { text: string; tap?: boolean }[]; button?: { text: string; tap?: boolean } };

export default function PhoneMock({ screen }: { screen: MockScreen }) {
  return (
    <div
      aria-hidden
      className="relative mx-auto w-[220px] shrink-0 overflow-hidden rounded-[34px] p-3"
      style={{ background: "#0f0a12", border: "1px solid rgba(255,220,180,0.25)", boxShadow: "0 30px 60px -25px rgba(0,0,0,0.8)" }}
    >
      <div className="mx-auto mb-3 h-1.5 w-16 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />
      <div className="min-h-[300px] rounded-[24px] p-3 text-[12px]" style={{ background: "#f7f3ef", color: "#2a1f2a" }}>
        <div className="mb-3 text-center text-[13px] font-semibold">{screen.title}</div>
        {screen.tabs && (
          <div className="mb-3 flex gap-1 rounded-full p-1" style={{ background: "#ebe4dd" }}>
            {screen.tabs.map((t) => (
              <Tap key={t.text} on={t.tap} className="flex-1 rounded-full py-1 text-center" style={{ background: t.tap ? "#fff" : "transparent" }}>
                {t.text}
              </Tap>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2">
          {screen.rows.map((r, i) => (
            <Tap key={i} on={r.tap} className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: "#fff" }}>
              <span>
                <span className="block font-medium">{r.text}</span>
                {r.sub && <span className="block text-[10px] opacity-60">{r.sub}</span>}
              </span>
              {r.right && <span style={{ color: r.tone === "danger" ? "#c2412d" : undefined }}>{r.right}</span>}
            </Tap>
          ))}
        </div>
        {screen.button && (
          <Tap on={screen.button.tap} className="mt-4 rounded-xl py-2 text-center font-semibold text-white" style={{ background: "#3b6cf6" }}>
            {screen.button.text}
          </Tap>
        )}
      </div>
    </div>
  );
}

function Tap({ on, children, className, style }: { on?: boolean; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`relative ${className ?? ""}`} style={style}>
      {children}
      {on && (
        <>
          <motion.span
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            style={{ boxShadow: "0 0 0 3px #f0a35e" }}
            animate={{ opacity: [1, 0.35, 1] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          />
          <span className="absolute -right-2 -top-3 rounded-full px-1.5 text-[11px] font-bold" style={{ background: "#f0a35e", color: "#2a1020" }}>
            tap
          </span>
        </>
      )}
    </div>
  );
}
