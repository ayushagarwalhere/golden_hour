// The guided questions' answers, kept on this device until the case is done.
// Private to the browser; "Start over" or a finished case clears it.

const KEY = "golden-hour:draft";
const MAX_AGE_MS = 14 * 24 * 3600 * 1000; // an abandoned draft is forgotten after two weeks

export type Draft = {
  step: "what" | "story" | "code" | "country" | "you" | "review";
  scenario: "drained" | "tricked" | "invest" | "link" | "unsure" | null;
  story: string;
  mode: "hash" | "address" | "none" | null;
  hashes: string[];
  address: string;
  picked: string[];
  country: string;
  name: string;
  contact: string;
};

const STEPS = new Set(["what", "story", "code", "country", "you", "review"]);

export function loadDraft(): Draft | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as (Draft & { savedAt?: number }) | null;
    if (!raw || typeof raw !== "object" || !STEPS.has(raw.step)) return null;
    if (raw.savedAt && Date.now() - raw.savedAt > MAX_AGE_MS) {
      clearDraft();
      return null;
    }
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    return {
      step: raw.step,
      scenario: raw.scenario ?? null,
      story: str(raw.story),
      mode: raw.mode ?? null,
      hashes: arr(raw.hashes),
      address: str(raw.address),
      picked: arr(raw.picked),
      country: str(raw.country),
      name: str(raw.name),
      contact: str(raw.contact),
    };
  } catch {
    return null;
  }
}

export function saveDraft(d: Draft) {
  try {
    const empty = d.step === "what" && !d.scenario && !d.story && !d.name && !d.contact;
    if (empty) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify({ ...d, savedAt: Date.now() }));
  } catch {
    /* storage blocked: the form still works, it just won't be remembered */
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
