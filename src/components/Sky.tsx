"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { usePrefs } from "@/lib/prefs";

const SkyScene = dynamic(() => import("./SkyScene"), { ssr: false });

/** Should this device get the animated WebGL sky? Older or low-memory phones, data savers and calm mode get the still one. */
function capable() {
  try {
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    if (nav.connection?.saveData) return false;
    if (nav.deviceMemory !== undefined && nav.deviceMemory < 4) return false;
    if (nav.hardwareConcurrency && nav.hardwareConcurrency < 4) return false;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    const gl = document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl");
    return Boolean(gl);
  } catch {
    return false;
  }
}

/**
 * The sunset behind every page. A still CSS sunset paints instantly on any device;
 * the animated shader is loaded afterwards, only where it will run smoothly.
 */
export default function Sky({ calm = 0 }: { calm?: number }) {
  const { calm: calmMode } = usePrefs();
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (calmMode || !capable()) return setLive(false);
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setLive(true), { timeout: 2500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = setTimeout(() => setLive(true), 800);
    return () => clearTimeout(t);
  }, [calmMode]);

  return (
    <>
      <div aria-hidden className="still-sky" />
      {live && <SkyScene calm={calm} />}
    </>
  );
}
