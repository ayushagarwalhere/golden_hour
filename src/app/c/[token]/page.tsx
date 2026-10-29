"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { Footer, Nav } from "@/components/Chrome";
import Sky from "@/components/Sky";
import { caseStore, type SavedCase } from "@/lib/caseStore";
import { useT } from "@/lib/prefs";

/** Opens a case from the phone line: keeps it on this device, then shows it like any other case. */
export default function PhoneCase({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const t = useT();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    fetch(`/api/cases/${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b: Pick<SavedCase, "input" | "trace" | "result">) => {
        caseStore.save({ id: b.result.caseId, input: b.input, trace: b.trace ?? null, result: b.result });
        location.replace(`/?case=${encodeURIComponent(b.result.caseId)}`);
      })
      .catch(() => setMissing(true));
  }, [token]);

  return (
    <main id="main" className="grain relative min-h-screen">
      <Sky />
      <Nav />
      <section className="relative z-10 mx-auto flex min-h-[70svh] max-w-2xl items-center justify-center px-5 pt-28 text-center">
        <div className="glass p-8 md:p-12">
          {missing ? (
            <>
              <h1 className="serif text-4xl">{t("nf.title")}</h1>
              <p className="mt-4 text-xl leading-9" style={{ color: "var(--mist)" }}>
                {t("pc.gone")}
              </p>
              <Link className="btn btn-sun btn-lg mt-8" href="/call">
                {t("call.start")}
              </Link>
            </>
          ) : (
            <p className="text-xl">{t("pc.opening")}</p>
          )}
        </div>
      </section>
      <Footer />
    </main>
  );
}
