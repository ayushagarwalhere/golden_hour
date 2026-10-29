import assert from "node:assert/strict";
import { test } from "node:test";
import { followUpDate, followUpLetter, reminderIcs } from "../src/lib/followup";

test("follow-up: due three days later at 10am local time", () => {
  const d = followUpDate(new Date(2026, 9, 29, 22, 15));
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()], [2026, 10, 1, 10]);
});

test("follow-up letter quotes the first message and asks for a hold confirmation", () => {
  const doc = { id: "freeze-kucoin", title: "Freeze request — KuCoin", body: "Subject: URGENT — stolen funds deposited to KuCoin [GH-1]\n\nTo the KuCoin team…" };
  const l = followUpLetter(doc, "GH-1", "2026-10-29T10:00:00Z", "Asha Rao");
  assert.match(l, /^Subject: FOLLOW-UP — URGENT — stolen funds deposited to KuCoin \[GH-1\]/);
  assert.match(l, /Hello KuCoin team/);
  assert.match(l, /29 October 2026/);
  assert.match(l, /Confirm that a hold is in place/);
  assert.match(l, /Asha Rao/);
  assert.ok(l.endsWith(doc.body));
});

test("reminder: a valid calendar file with escaped text and folded lines", () => {
  const ics = reminderIcs({
    uid: "GH-1-followup",
    start: new Date(2026, 10, 1, 10, 0),
    title: "Golden Hour: follow up on case GH-1",
    description: "Open your case, then send the follow-up letter; add your police number, if you have it.\nNever pay a 'recovery' agent. ".repeat(3),
    url: "https://example.org/?case=GH-1",
    now: new Date("2026-10-29T10:00:00Z"),
  });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20261101T100000\r\n/);
  assert.match(ics, /DTSTAMP:20261029T100000Z\r\n/);
  assert.match(ics, /letter\\; add your police number\\, if/);
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, `long line: ${line}`);
  assert.ok(ics.trimEnd().endsWith("END:VCALENDAR"));
});
