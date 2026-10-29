"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LangSwitch, ReadAloud } from "@/components/Access";
import { Footer, Nav } from "@/components/Chrome";
import { usePrefs, useT } from "@/lib/prefs";
import { checkMessage, FLAGS, type CheckResult } from "@/lib/scamcheck";

// A real-world pattern: the message victims get days after losing money.
const EXAMPLE =
  "Hello, I saw your post about losing USDT. I'm a certified recovery agent working with Binance security. " +
  "We can get your funds back within 48 hours. Pay a small release fee of 300 USDT to TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE " +
  "and install AnyDesk so our team can help. Please don't tell your bank, it slows the process. Visit binance-recovery-desk.top";

const TONE = {
  stop: { bg: "rgba(255,120,100,0.16)", border: "rgba(255,138,122,0.7)", icon: "✋" },
  careful: { bg: "rgba(255,200,120,0.14)", border: "rgba(255,200,120,0.6)", icon: "⚠️" },
  clear: { bg: "rgba(185,227,198,0.12)", border: "rgba(185,227,198,0.55)", icon: "🔍" },
} as const;

export default function CheckPage() {
  const t = useT();
  const { lang } = usePrefs();
  const [text, setText] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const out = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // "Share" from another app can land here as ?text=…
    const q = new URLSearchParams(location.search).get("text");
    if (q) {
      setText(q);
      setResult(checkMessage(q));
    }
  }, []);

  useEffect(() => {
    if (result) out.current?.focus();
  }, [result]);

  function run(v = text) {
    if (!v.trim()) return;
    setResult(checkMessage(v));
  }

  async function paste() {
    try {
      const v = await navigator.clipboard.readText();
      if (v) {
        setText(v);
        run(v);
      }
    } catch {
      /* the browser said no; the person can still long-press and paste */
    }
  }

  const headline = result ? t(`chk.${result.verdict}`) : "";
  const sub = result ? t(`chk.${result.verdict}Sub`) : "";
  const flagText = (id: keyof typeof FLAGS) => FLAGS[id].text[lang];
  const spoken = () =>
    result
      ? [headline, sub, ...result.flags.map((f) => `${flagText(f).title}. ${flagText(f).why}`), t("chk.do"), t("chk.do1"), t("chk.do2"), t("chk.do3")].join(" ")
      : "";

  async function share() {
    const body = [headline, ...(result?.flags.map((f) => `• ${flagText(f).title}`) ?? []), "", text.slice(0, 600)].join("\n");
    try {
      if (navigator.share) await navigator.share({ title: t("chk.title"), text: body });
      else await navigator.clipboard.writeText(body);
    } catch {
      /* cancelled */
    }
  }

  return (
    <main id="main" className="grain relative min-h-screen">
      <Nav />
      <section className="relative z-10 mx-auto max-w-3xl px-4 pb-24 pt-32 md:px-8">
        <div className="glass p-6 md:p-10">
          <div className="mb-6">
            <LangSwitch />
          </div>
          <h1 className="serif text-4xl md:text-6xl">{t("chk.title")}</h1>
          <p className="mt-4 text-xl leading-9" style={{ color: "var(--mist)" }}>
            {t("chk.sub")}
          </p>

          <label className="mt-8 block">
            <span className="text-lg">{t("chk.label")}</span>
            <textarea
              className="field mt-3 min-h-[11rem] text-lg leading-8"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setResult(null);
              }}
              spellCheck={false}
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className="btn btn-sun btn-lg" onClick={() => run()} disabled={!text.trim()}>
              {t("chk.go")}
            </button>
            <button type="button" className="btn btn-ghost" onClick={paste}>
              📋 {t("paste")}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setText(EXAMPLE);
                run(EXAMPLE);
              }}
            >
              {t("chk.example")}
            </button>
          </div>
          <p className="mt-4 text-base" style={{ color: "var(--faint)" }}>
            🔒 {t("chk.private")}
          </p>
        </div>

        {result && (
          <div ref={out} tabIndex={-1} aria-live="polite" className="mt-6 flex flex-col gap-6">
            <div className="rounded-3xl border-2 p-6 md:p-8" style={{ background: TONE[result.verdict].bg, borderColor: TONE[result.verdict].border }}>
              <div className="label">{t("chk.verdict")}</div>
              <h2 className="serif mt-2 text-3xl md:text-5xl">
                <span aria-hidden>{TONE[result.verdict].icon} </span>
                {headline}
              </h2>
              <p className="mt-3 text-xl leading-9">{sub}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <ReadAloud text={spoken} />
                <button type="button" className="btn btn-ghost btn-sm" onClick={share}>
                  {t("r.family")}
                </button>
              </div>
            </div>

            {result.flags.length > 0 && (
              <div className="glass p-6 md:p-8">
                <h3 className="text-2xl">{t("chk.found")}</h3>
                <ul className="mt-4 flex flex-col gap-4">
                  {result.flags.map((f) => (
                    <li key={f} className="rounded-2xl border p-4" style={{ borderColor: FLAGS[f].severity === "stop" ? "rgba(255,138,122,0.55)" : "var(--line)" }}>
                      <div className="text-lg font-medium">
                        {FLAGS[f].severity === "stop" ? "🛑 " : "⚠️ "}
                        {flagText(f).title}
                      </div>
                      <p className="mt-2 text-base leading-7" style={{ color: "var(--mist)" }}>
                        {flagText(f).why}
                      </p>
                    </li>
                  ))}
                </ul>
                {result.hosts.length > 0 && (
                  <div className="mt-5">
                    <div className="label">{t("chk.links")}</div>
                    <ul className="mt-2 flex flex-col gap-1">
                      {result.hosts.map((h) => (
                        <li key={h.host} className="mono text-base" style={{ color: h.flags.length ? "var(--danger)" : "var(--mist)" }}>
                          {h.flags.length ? "✗ " : "· "}
                          {h.host}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="glass p-6 md:p-8">
              <h3 className="text-2xl">{t("chk.do")}</h3>
              <ol className="mt-4 flex list-decimal flex-col gap-3 pl-6 text-lg leading-8">
                <li>{t("chk.do1")}</li>
                <li>{t("chk.do2")}</li>
                <li>{t("chk.do3")}</li>
                <li>{t("chk.do4")}</li>
              </ol>
              <div className="mt-6 rounded-2xl border p-5" style={{ borderColor: "var(--line)" }}>
                <p className="text-lg">{t("chk.paid")}</p>
                <Link className="btn btn-sun mt-3" href="/#begin">
                  {t("chk.paidBtn")} →
                </Link>
              </div>
              <button
                type="button"
                className="link mt-6 text-base"
                onClick={() => {
                  setText("");
                  setResult(null);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                {t("chk.again")}
              </button>
            </div>
          </div>
        )}
      </section>
      <Footer />
    </main>
  );
}
