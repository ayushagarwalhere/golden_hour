"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { HELPLINES } from "@/lib/directory";
import { LANGS } from "@/lib/i18n";
import { speak, stopSpeaking, usePrefs, useT, type TextSize } from "@/lib/prefs";

/** "Read this to me" — for anyone who finds reading hard right now. */
export function ReadAloud({ text, label }: { text: string | (() => string); label?: string }) {
  const t = useT();
  const [on, setOn] = useState(false);
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    setSupported("speechSynthesis" in window);
    return () => stopSpeaking();
  }, []);
  if (!supported) return null;
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      aria-pressed={on}
      onClick={() => {
        if (on) {
          stopSpeaking();
          setOn(false);
          return;
        }
        speak(typeof text === "function" ? text() : text);
        setOn(true);
        const poll = setInterval(() => {
          if (!window.speechSynthesis.speaking) {
            setOn(false);
            clearInterval(poll);
          }
        }, 500);
      }}
    >
      {on ? t("stopReading") : `🔊 ${label ?? t("readAloud")}`}
    </button>
  );
}

const COUNTRY_NAMES: Record<string, string> = { IN: "India", US: "United States", GB: "United Kingdom", CA: "Canada", AU: "Australia", SG: "Singapore" };

/** Language buttons. */
export function LangSwitch() {
  const { lang, setLang } = usePrefs();
  const t = useT();
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("language")}>
      {LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          role="radio"
          lang={l.id}
          aria-checked={lang === l.id}
          onClick={() => setLang(l.id)}
          className={`btn btn-sm flex-1 justify-center ${lang === l.id ? "btn-sun" : "btn-ghost"}`}
        >
          {l.name}
        </button>
      ))}
    </div>
  );
}

/** Floating help & comfort controls on every page. */
export function AccessBar() {
  const { textSize, setTextSize, calm, setCalm, contrast, setContrast } = usePrefs();
  const t = useT();
  const [open, setOpen] = useState(false);
  const sizes: [TextSize, string, string][] = [
    ["normal", "A", t("a.normal")],
    ["large", "A+", t("a.bigger")],
    ["xl", "A++", t("a.biggest")],
  ];
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-3 md:bottom-6 md:right-6">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.35 }}
            className="glass max-h-[calc(100svh-7rem)] w-[min(380px,calc(100vw-2rem))] overflow-auto p-5"
            style={{ background: "var(--panel)" }}
            role="dialog"
            aria-label={t("a.button")}
            data-lenis-prevent
          >
            <div className="label">{t("language")}</div>
            <div className="mt-2">
              <LangSwitch />
            </div>

            <div className="label mt-5">{t("a.text")}</div>
            <div className="mt-2 flex gap-2" role="radiogroup" aria-label={t("a.text")}>
              {sizes.map(([v, l, aria]) => (
                <button
                  key={v}
                  role="radio"
                  aria-checked={textSize === v}
                  aria-label={aria}
                  className={`btn btn-sm flex-1 justify-center ${textSize === v ? "btn-sun" : "btn-ghost"}`}
                  onClick={() => setTextSize(v)}
                >
                  {l}
                </button>
              ))}
            </div>

            <Toggle label={t("a.contrast")} sub={t("a.contrastSub")} checked={contrast} onChange={setContrast} />
            <Toggle label={t("a.calm")} sub={t("a.calmSub")} checked={calm} onChange={setCalm} />

            <div className="mt-5">
              <ReadAloud label={t("a.readPage")} text={() => (document.querySelector("main")?.innerText ?? "").slice(0, 4000)} />
            </div>

            <div className="label mt-6">{t("a.talk")}</div>
            <ul className="mt-2 flex flex-col gap-3 text-sm">
              {Object.entries(HELPLINES).map(([c, lines]) => (
                <li key={c}>
                  <span style={{ color: "var(--faint)" }}>{COUNTRY_NAMES[c] ?? c}</span>
                  {lines.map((h) => (
                    <div key={h.tel}>
                      {h.name}:{" "}
                      <a className="link text-base font-semibold" href={`tel:${h.tel}`}>
                        {h.phone}
                      </a>
                    </div>
                  ))}
                </li>
              ))}
              <li style={{ color: "var(--faint)" }}>{t("a.elsewhere")}</li>
            </ul>

            <Link href="/help" className="btn btn-sun btn-sm mt-6 w-full justify-center" onClick={() => setOpen(false)}>
              {t("a.guide")}
            </Link>
            <Link href="/call" className="btn btn-ghost btn-sm mt-3 w-full justify-center" onClick={() => setOpen(false)}>
              📞 {t("call.title")}
            </Link>
            <Link href="/check" className="btn btn-ghost btn-sm mt-3 w-full justify-center" onClick={() => setOpen(false)}>
              🔍 {t("nav.check")}
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
      <button className="btn btn-sun shadow-lg" style={{ padding: "14px 20px" }} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={t("a.button")}>
        {open ? t("a.close") : t("a.button")}
      </button>
    </div>
  );
}

function Toggle({ label, sub, checked, onChange }: { label: string; sub: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mt-5 flex cursor-pointer items-center justify-between gap-3">
      <span>
        <span className="block font-medium">{label}</span>
        <span className="text-sm" style={{ color: "var(--faint)" }}>
          {sub}
        </span>
      </span>
      <input type="checkbox" className="h-6 w-6 shrink-0 accent-[#ffd29a]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
