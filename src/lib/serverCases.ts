// Cases from the phone line. A caller has no browser during the call, so their finished case is kept on the
// server under a long random link (texted to them) for 30 days, then deleted. Web cases never come here:
// they stay in the visitor's own browser.

import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const DIR = () => process.env.DATA_DIR || path.join(process.cwd(), "data", "cases");
export const KEEP_DAYS = Number(process.env.PHONE_CASE_DAYS ?? 30);
const TOKEN = /^[A-Za-z0-9_-]{32}$/;

export async function saveCase(bundle: unknown): Promise<string> {
  const dir = DIR();
  await mkdir(dir, { recursive: true });
  const token = randomBytes(24).toString("base64url"); // 192 bits: the link is the key
  await writeFile(path.join(dir, `${token}.json`), JSON.stringify({ savedAt: new Date().toISOString(), bundle }), { mode: 0o600 });
  prune().catch(() => {});
  return token;
}

export async function loadCase(token: string): Promise<unknown | null> {
  if (!TOKEN.test(token)) return null;
  try {
    const raw = JSON.parse(await readFile(path.join(DIR(), `${token}.json`), "utf8")) as { savedAt: string; bundle: unknown };
    if (Date.now() - Date.parse(raw.savedAt) > KEEP_DAYS * 86_400_000) return null;
    return raw.bundle;
  } catch {
    return null;
  }
}

/** Delete cases older than KEEP_DAYS. */
export async function prune() {
  const dir = DIR();
  const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
  for (const f of await readdir(dir).catch(() => [] as string[])) {
    if (!f.endsWith(".json")) continue;
    const p = path.join(dir, f);
    const s = await stat(p).catch(() => null);
    if (s && s.mtimeMs < cutoff) await unlink(p).catch(() => {});
  }
}

/** Only the phone relay (inside the same deployment) may store cases. */
export function internalAllowed(req: Request) {
  const want = process.env.INTERNAL_TOKEN;
  return Boolean(want) && req.headers.get("x-internal-token") === want;
}
