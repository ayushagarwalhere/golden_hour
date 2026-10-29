"use client";

import { MotionConfig } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { speechLang, translate, type Key, type Lang } from "./i18n";
import { chunks, loadVoicePrefs, pickVoice } from "./voice";

export type TextSize = "normal" | "large" | "xl";
type Prefs = {
  textSize: TextSize;
  calm: boolean;
  contrast: boolean;
  lang: Lang;
  setTextSize: (t: TextSize) => void;
  setCalm: (c: boolean) => void;
  setContrast: (c: boolean) => void;
  setLang: (l: Lang) => void;
};

const noop = () => {};
const PrefsContext = createContext<Prefs>({ textSize: "normal", calm: false, contrast: false, lang: "en", setTextSize: noop, setCalm: noop, setContrast: noop, setLang: noop });
const KEY = "golden-hour:prefs";

/** Text size, calm mode, high contrast and language — remembered on this device and applied to the whole page. */
export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [textSize, setTextSize] = useState<TextSize>("normal");
  const [calm, setCalm] = useState(false);
  const [contrast, setContrast] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>;
      if (p.textSize) setTextSize(p.textSize);
      if (typeof p.calm === "boolean") setCalm(p.calm);
      else if (matchMedia("(prefers-reduced-motion: reduce)").matches) setCalm(true);
      if (typeof p.contrast === "boolean") setContrast(p.contrast);
      else if (matchMedia("(prefers-contrast: more)").matches) setContrast(true);
      if (p.lang === "en" || p.lang === "hi" || p.lang === "es") setLang(p.lang);
      else if (navigator.language.startsWith("hi")) setLang("hi");
      else if (navigator.language.startsWith("es")) setLang("es");
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    html.dataset.text = textSize;
    html.classList.toggle("calm", calm);
    html.classList.toggle("contrast", contrast);
    html.lang = lang;
    if (!loaded) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ textSize, calm, contrast, lang }));
    } catch {
      /* ignore */
    }
  }, [textSize, calm, contrast, lang, loaded]);

  return (
    <PrefsContext.Provider value={{ textSize, calm, contrast, lang, setTextSize, setCalm, setContrast, setLang }}>
      <MotionConfig reducedMotion={calm ? "always" : "user"}>{children}</MotionConfig>
    </PrefsContext.Provider>
  );
}

export const usePrefs = () => useContext(PrefsContext);

/** Translator for the current language: t("hero.start"), t("r.found", { entity }). */
export function useT() {
  const { lang } = usePrefs();
  return useCallback((key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);
}

/** Read text aloud with the device's own voice (no data leaves the device). */
export function speak(text: string, lang?: string, onEnd?: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const tag = lang ?? speechLang((document.documentElement.lang as Lang) || "en");
  window.speechSynthesis.cancel();
  // speak in short chunks — long utterances get cut off on some browsers
  const parts = chunks(text);
  const { name, rate } = loadVoicePrefs();
  const voice = pickVoice(tag, name);
  parts.forEach((c, i) => {
    const u = new SpeechSynthesisUtterance(c);
    u.rate = rate;
    u.lang = tag;
    if (voice) u.voice = voice;
    if (onEnd && i === parts.length - 1) {
      u.onend = onEnd;
      u.onerror = onEnd;
    }
    window.speechSynthesis.speak(u);
  });
  return true;
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
