"use client";

import Link from "next/link";
import { useState } from "react";
import { ReadAloud } from "@/components/Access";
import { Footer, Nav } from "@/components/Chrome";
import PhoneMock from "@/components/PhoneMock";
import { HELP, type HelpContent } from "@/lib/helpContent";
import { usePrefs } from "@/lib/prefs";

/* Everything on this page is written for someone who has never used crypto before,
   or who is helping a parent or grandparent. Short sentences. No jargon without an explanation.
   The words themselves live in src/lib/helpContent.ts, one copy per language. */

export default function Help() {
  const { lang } = usePrefs();
  const c = HELP[lang];
  const [wallet, setWallet] = useState(c.wallets[0].id);
  const w = c.wallets.find((x) => x.id === wallet) ?? c.wallets[0];
  return (
    <main id="main" className="relative min-h-screen" style={{ background: "radial-gradient(120% 70% at 50% 110%, #7a3040 0%, #2a1430 45%, #160c1c 80%)" }}>
      <Nav />
      <div className="relative z-10 mx-auto max-w-4xl px-5 pb-24 pt-32">
        <h1 className="serif text-5xl leading-[1.02] md:text-7xl">{c.title}</h1>
        <p className="mt-5 max-w-2xl text-xl leading-9" style={{ color: "var(--mist)" }}>
          {c.introA}
          <b style={{ color: "var(--gold)" }}>Aa</b>
          {c.introB}
        </p>
        <nav className="mt-8 flex flex-wrap gap-2 text-sm" aria-label={c.navLabel}>
          {[
            ["#now", c.nav.now],
            ["#find-id", c.nav.findId],
            ["#words", c.nav.words],
            ["#scams", c.nav.scams],
            ["#family", c.nav.family],
            ["#after", c.nav.after],
          ].map(([h, t]) => (
            <a key={h} href={h} className="chip text-sm hover:text-[var(--gold)]">
              {t}
            </a>
          ))}
          <button className="chip text-sm" onClick={() => print()}>
            {c.print}
          </button>
        </nav>

        <Section id="now" title={c.now.title} label={c.readAloud} read={c.now.items.map(({ t, d }) => `${t} ${d}`).join(" ")}>
          <ol className="flex flex-col gap-4">
            {c.now.items.map(({ t, d }, i) => (
              <li key={t} className="glass flex gap-5 p-5 md:p-6">
                <span className="serif text-4xl" style={{ color: "var(--gold)" }}>
                  {i + 1}
                </span>
                <div>
                  <div className="text-xl font-medium">{t}</div>
                  <p className="mt-1 text-lg leading-8" style={{ color: "var(--mist)" }}>
                    {d}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="btn btn-sun" href="/#begin">
              {c.now.start}
            </Link>
            <a className="btn btn-ghost" href="tel:1930">
              {c.now.call}
            </a>
          </div>
        </Section>

        <Section
          id="find-id"
          title={c.find.title}
          label={c.readAloud}
          read={`${w.name}. ${w.intro} ${w.steps.map((s, i) => `${c.step} ${i + 1}. ${s.text}`).join(" ")}`}
        >
          <p className="text-lg leading-8" style={{ color: "var(--mist)" }}>
            {c.find.pickA}
            <i>Activity</i>, <i>History</i> {c.find.pickOr} <i>Transactions</i>
            {c.find.pickB}
            {c.find.appLangNote && ` ${c.find.appLangNote}`}
          </p>
          <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label={c.find.tabsLabel}>
            {c.wallets.map((x) => (
              <button key={x.id} role="tab" aria-selected={x.id === wallet} onClick={() => setWallet(x.id)} className={`btn ${x.id === wallet ? "btn-sun" : "btn-ghost"}`}>
                {x.name}
              </button>
            ))}
          </div>
          <p className="mt-6 text-lg" style={{ color: "var(--mist)" }}>
            {w.intro}
          </p>
          <ol className="mt-6 flex flex-col gap-5">
            {w.steps.map((s, i) => (
              <li key={i} className="glass flex flex-col gap-6 p-5 md:flex-row md:items-center md:p-7">
                <div className="flex flex-1 gap-5">
                  <span className="serif text-4xl" style={{ color: "var(--gold)" }}>
                    {i + 1}
                  </span>
                  <p className="text-xl leading-9">{s.text}</p>
                </div>
                {s.screen && <PhoneMock screen={s.screen} />}
              </li>
            ))}
          </ol>
          <div className="glass mt-6 p-5 text-lg leading-8">
            <b>{c.find.looksLike}</b> <span className="mono break-all text-base">0x13c78d3568cb403b26b94d8525cc75a7adb68e3f1def0a17fe846a23e86be793</span>
            <br />
            <span style={{ color: "var(--mist)" }}>{c.find.looksNote}</span>
          </div>
        </Section>

        <Section id="words" title={c.words.title} label={c.readAloud} read={c.words.items.map(({ t, d }) => `${t}: ${d}`).join(" ")}>
          <dl className="grid gap-4 md:grid-cols-2">
            {c.words.items.map(({ t, d }) => (
              <div key={t} className="glass p-5">
                <dt className="text-xl font-medium" style={{ color: "var(--gold)" }}>
                  {t}
                </dt>
                <dd className="mt-2 text-lg leading-8" style={{ color: "var(--mist)" }}>
                  {d}
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section
          id="scams"
          title={c.scams.title}
          label={c.readAloud}
          read={`${c.scams.readPrefix} ${c.scams.flags.join(" ")} ${c.scams.checkA}${c.scams.checkLink}${c.scams.checkB}`}
        >
          <p className="text-lg leading-8" style={{ color: "var(--mist)" }}>
            {c.scams.intro}
          </p>
          <ul className="mt-5 flex flex-col gap-3">
            {c.scams.flags.map((f) => (
              <li key={f} className="glass flex gap-4 p-5 text-lg leading-8" style={{ borderColor: "rgba(255,138,122,0.35)" }}>
                <span aria-hidden style={{ color: "var(--danger)" }}>
                  ⚠
                </span>
                {f}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-lg leading-8" style={{ color: "var(--mist)" }}>
            {c.scams.checkA}
            <Link href="/check" className="link">
              {c.scams.checkLink}
            </Link>
            {c.scams.checkB}
          </p>
        </Section>

        <Section id="family" title={c.family.title} label={c.readAloud} read={c.family.read}>
          <ul className="flex flex-col gap-3 text-lg leading-8">
            {c.family.items.map((t) => (
              <li key={t} className="glass p-5">
                {t}
              </li>
            ))}
          </ul>
          <ShareBox share={c.share} />
        </Section>

        <Section id="after" title={c.after.title} label={c.readAloud} read={c.after.read}>
          <ol className="flex flex-col gap-3 text-lg leading-8">
            {c.after.items.map(({ t, d }) => (
              <li key={t} className="glass p-5">
                <b style={{ color: "var(--gold)" }}>{t}</b> <span style={{ color: "var(--mist)" }}>{d}</span>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-lg" style={{ color: "var(--mist)" }}>
            {c.after.keepA}
            <Link href="/verify" className="link">
              {c.after.keepLink}
            </Link>
            {c.after.keepB}
          </p>
        </Section>
      </div>
      <Footer />
    </main>
  );
}

function Section({ id, title, label, read, children }: { id: string; title: string; label: string; read: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-20 scroll-mt-28">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <h2 className="serif text-4xl md:text-5xl">{title}</h2>
        <ReadAloud text={`${title}. ${read}`} label={label} />
      </div>
      {children}
    </section>
  );
}

function ShareBox({ share }: { share: HelpContent["share"] }) {
  const [done, setDone] = useState(false);
  const url = typeof window !== "undefined" ? `${location.origin}/help` : "/help";
  return (
    <div className="glass mt-6 flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
      <span className="text-lg">{share.prompt}</span>
      <button
        className="btn btn-sun"
        onClick={async () => {
          const text = share.text;
          try {
            if (navigator.share) await navigator.share({ title: share.title, text, url });
            else await navigator.clipboard.writeText(`${text} ${url}`);
            setDone(true);
          } catch {
            /* user cancelled */
          }
        }}
      >
        {done ? share.done : share.button}
      </button>
    </div>
  );
}
