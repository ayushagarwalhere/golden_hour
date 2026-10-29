"use client";

// The helper's voice in the browser: picks the most natural-sounding voice the device has (or the one the caller
// chose), and speaks sentences one after another so a reply can start before it has been fully written.
// Everything here runs on the device; no audio leaves it.

export type VoicePrefs = { name: string | null; rate: number };
const KEY = "golden-hour:voice";
export const RATES = { slow: 0.8, normal: 0.95 } as const;

export function loadVoicePrefs(): VoicePrefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<VoicePrefs>;
    return { name: typeof p.name === "string" ? p.name : null, rate: typeof p.rate === "number" && p.rate >= 0.6 && p.rate <= 1.3 ? p.rate : RATES.normal };
  } catch {
    return { name: null, rate: RATES.normal };
  }
}

export function saveVoicePrefs(p: VoicePrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode: fine, it just isn't remembered */
  }
}

const supported = () => typeof window !== "undefined" && "speechSynthesis" in window;
const norm = (s: string) => s.replace("_", "-").toLowerCase();
// Voices that sound like a person rather than a robot, across Edge, Chrome, Safari and Android.
const NATURAL = /natural|neural|online|premium|enhanced|google|siri|samantha|aria|jenny|guy|sonia|libby|swara|madhur|neerja|prabhat|kalpana|hemant|lekha|dalia|elvira|alvaro|helena|paulina|monica|mónica|jorge/i;

/** Voices for this language, best first. */
export function voicesFor(tag: string): SpeechSynthesisVoice[] {
  if (!supported()) return [];
  const want = norm(tag);
  const base = want.slice(0, 2);
  const score = (v: SpeechSynthesisVoice) => (norm(v.lang) === want ? 4 : 0) + (NATURAL.test(v.name) ? 3 : 0) + (v.localService ? 0 : 1) + (v.default ? 0.5 : 0);
  return window.speechSynthesis
    .getVoices()
    .filter((v) => norm(v.lang).slice(0, 2) === base)
    .sort((a, b) => score(b) - score(a));
}

export function pickVoice(tag: string, name?: string | null) {
  const list = voicesFor(tag);
  return (name && list.find((v) => v.name === name)) || list[0] || null;
}

/** Voices load late in Chrome: call back once they're there. */
export function onVoicesReady(cb: () => void) {
  if (!supported()) return () => {};
  if (window.speechSynthesis.getVoices().length) cb();
  window.speechSynthesis.addEventListener("voiceschanged", cb);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", cb);
}

/** Split into short pieces: long utterances get cut off on some browsers. */
export const chunks = (text: string) => (text.replace(/\s+/g, " ").match(/[^.!?।]+[.!?।]*["')]*/g) ?? [text]).map((c) => c.trim()).filter(Boolean);

/**
 * A queue of things to say. say() adds to the end; stop() goes quiet at once (when the caller interrupts).
 * onIdle fires each time the queue runs dry. Some engines never report the end of an utterance, so every
 * piece also has a safety timer: the call can never stall on a silent voice engine.
 */
export class Speaker {
  private queue: string[] = [];
  private current = "";
  private timer: ReturnType<typeof setTimeout> | null = null;
  private gen = 0;
  constructor(
    private opts: { lang: () => string; prefs: () => VoicePrefs; onIdle: () => void; onStart?: () => void },
  ) {}

  /** Everything being said or about to be said: the microphone may hear it and must not mistake it for the caller. */
  get text() {
    return [this.current, ...this.queue].join(" ").trim();
  }
  get busy() {
    return Boolean(this.current) || this.queue.length > 0;
  }

  say(text: string) {
    const parts = chunks(text);
    if (!parts.length) return;
    this.queue.push(...parts);
    if (!this.current) this.next();
  }

  stop() {
    this.gen++;
    this.queue = [];
    this.current = "";
    if (this.timer) clearTimeout(this.timer);
    if (supported()) window.speechSynthesis.cancel();
  }

  private next() {
    if (this.timer) clearTimeout(this.timer);
    const piece = this.queue.shift();
    if (!piece) {
      this.current = "";
      this.opts.onIdle();
      return;
    }
    const first = !this.current;
    this.current = piece;
    if (first) this.opts.onStart?.();
    if (!supported()) {
      this.timer = setTimeout(() => this.next(), 400 + piece.length * 55);
      return;
    }
    const gen = this.gen;
    const { name, rate } = this.opts.prefs();
    const tag = this.opts.lang();
    const u = new SpeechSynthesisUtterance(piece);
    u.lang = tag;
    u.rate = rate;
    const v = pickVoice(tag, name);
    if (v) u.voice = v;
    let done = false;
    const finish = () => {
      if (done || gen !== this.gen) return;
      done = true;
      this.next();
    };
    u.onend = finish;
    u.onerror = finish;
    this.timer = setTimeout(finish, 2500 + (piece.length * 95) / rate);
    window.speechSynthesis.speak(u);
  }
}

/** Soft two-note tones, like a phone line connecting (up) or hanging up (down). */
export function tone(kind: "connect" | "end") {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const notes = kind === "connect" ? [523.25, 783.99] : [659.25, 440];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t0 = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.07, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
      o.connect(g).connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + 0.35);
    });
    setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch {
    /* no audio: the call still works */
  }
}

/** Keep the screen on during a call: when a phone's screen dims, the browser stops listening. */
export function keepAwake() {
  type Lock = { release(): Promise<void> };
  const nav = navigator as unknown as { wakeLock?: { request(type: "screen"): Promise<Lock> } };
  let lock: Lock | null = null;
  let on = true;
  const get = () => {
    if (on && nav.wakeLock && document.visibilityState === "visible")
      nav.wakeLock
        .request("screen")
        .then((l) => (lock = l))
        .catch(() => {});
  };
  get();
  document.addEventListener("visibilitychange", get);
  return () => {
    on = false;
    document.removeEventListener("visibilitychange", get);
    lock?.release().catch(() => {});
  };
}

/**
 * How loud the caller is right now (0–1), for the orb that shows "I can hear you".
 * Desktop only: on phones a second microphone user can stop the browser's speech recognition.
 */
export async function micLevel(onLevel: (v: number) => void): Promise<() => void> {
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (mobile || !navigator.mediaDevices?.getUserMedia) return () => {};
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const ctx = new AudioContext();
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    let raf = 0;
    let smooth = 0;
    const tick = () => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const b of buf) sum += ((b - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / buf.length);
      smooth = smooth * 0.75 + Math.min(1, rms * 6) * 0.25;
      onLevel(smooth);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
    };
  } catch {
    return () => {};
  }
}

/** Words that mean the caller hasn't finished their sentence yet ("I sent it to them and…"). */
const TRAILING = /\b(and|but|so|because|then|um+|uh+|er+|like|the|a|to|of|with|my|i)\s*$|(और|लेकिन|फिर|क्योंकि|तो|कि)\s*$|\b(y|pero|entonces|porque|que|el|la|de|mi)\s*$/i;

/** How long a pause means "I've finished talking". Longer when the sentence is clearly still going. */
export function turnPause(heard: string, final: boolean) {
  let ms = final ? 1200 : 1800;
  if (TRAILING.test(heard.trim())) ms += 1300;
  return ms;
}
