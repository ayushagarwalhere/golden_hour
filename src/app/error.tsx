"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Footer, Nav } from "@/components/Chrome";
import { HELPLINES } from "@/lib/directory";
import { useT } from "@/lib/prefs";

/** If a page crashes, the victim sees calm words, a retry, and phone numbers — never a stack trace. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => console.error(error), [error]);
  const lines = Object.values(HELPLINES).flat().slice(0, 4);
  return (
    <main id="main" className="relative min-h-screen" style={{ background: "radial-gradient(120% 70% at 50% 110%, #7a3040 0%, #2a1430 45%, #160c1c 80%)" }}>
      <Nav />
      <section className="relative z-10 mx-auto flex min-h-[80svh] max-w-2xl flex-col items-center justify-center px-5 pt-28 text-center">
        <div className="glass p-8 md:p-12">
          <h1 className="serif text-4xl md:text-5xl">{t("oops.title")}</h1>
          <p className="mt-5 text-xl leading-9" style={{ color: "var(--mist)" }}>
            {t("oops.sub")}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button type="button" className="btn btn-sun btn-lg" onClick={reset}>
              {t("oops.retry")}
            </button>
            <Link className="btn btn-ghost" href="/">
              {t("nf.home")}
            </Link>
          </div>
          <ul className="mt-8 flex flex-col gap-2 text-base">
            {lines.map((h) => (
              <li key={h.tel}>
                <a className="link" href={`tel:${h.tel}`}>
                  📞 {h.name.split(" (")[0]} · {h.phone}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <Footer />
    </main>
  );
}
