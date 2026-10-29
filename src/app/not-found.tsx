"use client";

import Link from "next/link";
import { Footer, Nav } from "@/components/Chrome";
import Sky from "@/components/Sky";
import { useT } from "@/lib/prefs";

export default function NotFound() {
  const t = useT();
  return (
    <main id="main" className="grain relative min-h-screen">
      <Sky />
      <Nav />
      <section className="relative z-10 mx-auto flex min-h-[80svh] max-w-2xl flex-col items-center justify-center px-5 pt-28 text-center">
        <div className="glass p-8 md:p-12">
          <h1 className="serif text-4xl md:text-6xl">{t("nf.title")}</h1>
          <p className="mt-5 text-xl leading-9" style={{ color: "var(--mist)" }}>
            {t("nf.sub")}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link className="btn btn-sun btn-lg" href="/">
              {t("nf.home")}
            </Link>
            <Link className="btn btn-ghost" href="/check">
              🔍 {t("nav.check")}
            </Link>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
