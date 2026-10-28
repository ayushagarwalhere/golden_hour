"use client";

// Cases are kept only in this browser. Nothing about the victim is stored on our server.
import type { CaseDocument, Step } from "./documents";
import type { TraceResult } from "./trace";

export type CaseInput = {
  story: string;
  txHashes: string[];
  victimAddress: string;
  country: string;
  name: string;
  contact: string;
};

export type CaseResult = {
  caseId: string;
  sha256: string;
  evidenceJson: string;
  narrative: { text: string; aiUsed: boolean };
  documents: CaseDocument[];
  plan: Step[];
  /** No on-chain trace: the report was written from the victim's account. */
  storyOnly?: boolean;
  /** Why we fell back to story-only ("other-network", or a message for the victim). */
  notice?: string | null;
};

export type SavedCase = {
  id: string;
  savedAt: string;
  input: CaseInput;
  trace: TraceResult | null;
  result: CaseResult;
  edits?: Record<string, string>;
  /** Checklist steps the victim has ticked off. */
  done?: string[];
};

const KEY = "golden-hour:cases";

function read(): SavedCase[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as SavedCase[];
  } catch {
    return [];
  }
}

function write(cases: SavedCase[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cases.slice(0, 12)));
  } catch {
    /* storage full or blocked — cases just won't persist */
  }
}

export const caseStore = {
  list: () => read().sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
  get: (id: string) => read().find((c) => c.id === id) ?? null,
  save(c: Omit<SavedCase, "savedAt">) {
    const rest = read().filter((x) => x.id !== c.id);
    write([{ ...c, savedAt: new Date().toISOString() }, ...rest]);
  },
  saveEdits(id: string, edits: Record<string, string>) {
    write(read().map((c) => (c.id === id ? { ...c, edits } : c)));
  },
  saveDone(id: string, done: string[]) {
    write(read().map((c) => (c.id === id ? { ...c, done } : c)));
  },
  remove: (id: string) => write(read().filter((c) => c.id !== id)),
};
