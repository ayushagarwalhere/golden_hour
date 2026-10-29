// Following up. Exchanges and police are often slow, and a polite reminder that quotes the first message
// (and, by then, a police case number) is what gets a hold confirmed. No imports: safe in the browser.

type Doc = { id: string; title: string; body: string };

export const FOLLOW_UP_DAYS = 3;

export function followUpDate(from: Date | string, days = FOLLOW_UP_DAYS) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  d.setHours(10, 0, 0, 0);
  return d;
}

const longDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** A short follow-up to an exchange or stablecoin issuer, with the first letter quoted underneath. */
export function followUpLetter(doc: Doc, caseId: string, sentOn: Date | string, name?: string | null) {
  const first = doc.body.split("\n")[0].replace(/^Subject:\s*/, "");
  const to = doc.title.replace(/^(Freeze request|Stablecoin freeze) — /, "");
  return `Subject: FOLLOW-UP — ${first}

Hello ${to} team,

I wrote to you on ${longDate(new Date(sentOn))} about funds from my case ${caseId}. I have not yet had a reply or a reference number, and every day matters for funds that can still be moved.

Please:
  1. Confirm that a hold is in place on the account(s) or address(es) in my first message.
  2. Send me your reference number.
  3. Tell me how my police officer can request the records, if a formal request is needed.

Police report / case number: [add it here]

My first message is copied below.

${name ?? "[Your full name]"}

---------- First message ----------
${doc.body}`;
}

const pad = (n: number) => String(n).padStart(2, "0");
const icsDate = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const icsUtc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Fold long lines at 75 bytes, as the calendar format requires. */
function fold(line: string) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let len = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (len + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      len = 0;
    }
    cur += ch;
    len += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

/** A calendar reminder (.ics) that phones and computers open in their own calendar app. */
export function reminderIcs(opts: { uid: string; start: Date; title: string; description: string; url?: string; now?: Date }) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Golden Hour//Follow-up reminder//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${opts.uid}@golden-hour`,
    `DTSTAMP:${icsUtc(opts.now ?? new Date())}`,
    `DTSTART:${icsDate(opts.start)}`,
    "DURATION:PT30M",
    `SUMMARY:${esc(opts.title)}`,
    `DESCRIPTION:${esc(opts.description)}`,
    ...(opts.url ? [`URL:${opts.url}`] : []),
    "BEGIN:VALARM",
    "TRIGGER:PT0M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(opts.title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
