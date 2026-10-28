// Where to report. Kept deliberately small and conservative: official domains only.
// Contact routes change — the UI tells victims to confirm on the official site before sending.

export type ReportChannel = { name: string; url: string; note?: string };

export const POLICE: Record<string, ReportChannel[]> = {
  IN: [
    { name: "National Cyber Crime Reporting Portal", url: "https://cybercrime.gov.in", note: "Also call the 1930 cyber-fraud helpline as soon as possible." },
  ],
  US: [{ name: "FBI Internet Crime Complaint Center (IC3)", url: "https://www.ic3.gov" }],
  GB: [{ name: "Action Fraud / Report Fraud (UK national fraud reporting)", url: "https://www.actionfraud.police.uk" }],
  AU: [{ name: "ReportCyber (Australian Cyber Security Centre)", url: "https://www.cyber.gov.au/report-and-recover/report" }],
  CA: [{ name: "Canadian Anti-Fraud Centre", url: "https://antifraudcentre-centreantifraude.ca" }],
  SG: [{ name: "Singapore Police Force e-Services", url: "https://eservices.police.gov.sg" }],
};

export const FALLBACK_POLICE: ReportChannel[] = [
  { name: "Your local police cybercrime unit", url: "", note: "Ask for a written report / case number — exchanges usually require one before acting." },
];

export const EMERGENCY: ReportChannel[] = [
  {
    name: "SEAL 911 (Security Alliance)",
    url: "https://securityalliance.org",
    note: "Volunteer white-hat emergency line for active crypto thefts. Use when funds are still moving.",
  },
];

/** Official support entry points for exchanges we commonly see as cash-out points. */
export const EXCHANGES: Record<string, { site: string; support: string }> = {
  binance: { site: "binance.com", support: "https://www.binance.com/en/support" },
  coinbase: { site: "coinbase.com", support: "https://help.coinbase.com" },
  okx: { site: "okx.com", support: "https://www.okx.com/help" },
  kraken: { site: "kraken.com", support: "https://support.kraken.com" },
  bybit: { site: "bybit.com", support: "https://www.bybit.com/en/help-center" },
  kucoin: { site: "kucoin.com", support: "https://www.kucoin.com/support" },
  "gate.io": { site: "gate.io", support: "https://www.gate.io/help" },
  gate: { site: "gate.io", support: "https://www.gate.io/help" },
  htx: { site: "htx.com", support: "https://www.htx.com/support" },
  huobi: { site: "htx.com", support: "https://www.htx.com/support" },
  mexc: { site: "mexc.com", support: "https://www.mexc.com/support" },
  bitget: { site: "bitget.com", support: "https://www.bitget.com/support" },
  fixedfloat: { site: "ff.io", support: "https://ff.io" },
  changenow: { site: "changenow.io", support: "https://changenow.io" },
};

export function exchangeContact(entity: string) {
  const k = entity.toLowerCase().trim();
  const hit = EXCHANGES[k] ?? Object.entries(EXCHANGES).find(([key]) => k.includes(key))?.[1];
  return hit ?? null;
}

export function policeFor(country: string | null | undefined) {
  return (country && POLICE[country.toUpperCase()]) || FALLBACK_POLICE;
}

export type Helpline = { id?: string; name: string; phone: string; tel: string; note?: string };

/** People to talk to, by country. Free public lines only. */
export const HELPLINES: Record<string, Helpline[]> = {
  IN: [{ id: "in1930", name: "National Cyber Crime Helpline", phone: "1930", tel: "1930", note: "Free, 24 hours. Call as soon as you can — banks can hold money faster when you call quickly." }],
  US: [
    { id: "usElder", name: "National Elder Fraud Hotline (US Dept. of Justice)", phone: "1-833-372-8311", tel: "+18333728311", note: "For people aged 60 or older. Weekdays 10am–6pm Eastern." },
    { id: "usAarp", name: "AARP Fraud Watch Helpline", phone: "1-877-908-3360", tel: "+18779083360", note: "Free for everyone, AARP member or not." },
  ],
  GB: [{ name: "Action Fraud / Report Fraud", phone: "0300 123 2040", tel: "+443001232040" }],
  CA: [{ name: "Canadian Anti-Fraud Centre", phone: "1-888-495-8501", tel: "+18884958501" }],
  AU: [{ name: "IDCARE (free identity & cyber support)", phone: "1800 595 160", tel: "1800595160" }],
  SG: [{ id: "sg1799", name: "ScamShield Helpline", phone: "1799", tel: "1799", note: "24 hours." }],
};

export function helplinesFor(country: string | null | undefined): Helpline[] {
  return (country && HELPLINES[country.toUpperCase()]) || [];
}
