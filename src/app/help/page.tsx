"use client";

import Link from "next/link";
import { useState } from "react";
import { ReadAloud } from "@/components/Access";
import { Footer, Nav } from "@/components/Chrome";
import PhoneMock, { type MockScreen } from "@/components/PhoneMock";

/* Everything on this page is written for someone who has never used crypto before,
   or who is helping a parent or grandparent. Short sentences. No jargon without an explanation. */

const NOW = [
  ["Breathe. This is not your fault.", "These scams are run by professionals. Clever, careful people fall for them every day."],
  ["Don't send money to anyone who promises to get it back.", "People who message you offering to “recover” your crypto are almost always a second scam."],
  ["Never share your 12 or 24 secret words.", "That's your recovery phrase. Nobody real — not the police, not an exchange, not us — will ever ask for it."],
  ["Find the transaction ID if you can.", "It's a long code that starts with 0x. The guide below shows you where to find it. Can't find it? Golden Hour still writes your police report from what you tell it."],
  ["Use Golden Hour, then call for help.", "Golden Hour writes the letters for you. In India, also call 1930 — the free cyber-fraud helpline."],
] as const;

type Wallet = { id: string; name: string; intro: string; steps: { text: string; screen?: MockScreen }[] };

const WALLETS: Wallet[] = [
  {
    id: "metamask",
    name: "MetaMask",
    intro: "The fox app. On a phone or as a browser add-on.",
    steps: [
      { text: "Open MetaMask and unlock it with your password." },
      {
        text: "Tap “Activity”. It's usually a tab under your balance or at the bottom of the screen.",
        screen: { title: "Wallet", tabs: [{ text: "Tokens" }, { text: "NFTs" }, { text: "Activity", tap: true }], rows: [{ text: "ETH", right: "0.00" }, { text: "USDT", right: "0.00" }] },
      },
      {
        text: "Tap the transfer you didn't make. It will say “Sent” or “Send”.",
        screen: { title: "Activity", rows: [{ text: "Sent", sub: "Today, 4:03 pm", right: "−4.98 ETH", tap: true, tone: "danger" }, { text: "Received", sub: "12 Aug", right: "+0.5 ETH" }] },
      },
      {
        text: "Tap “Copy transaction ID” — or “View on block explorer”, then copy the long code starting with 0x.",
        screen: { title: "Sent", rows: [{ text: "Status", right: "Confirmed" }, { text: "Amount", right: "−4.98 ETH", tone: "danger" }], button: { text: "Copy transaction ID", tap: true } },
      },
    ],
  },
  {
    id: "trust",
    name: "Trust Wallet",
    intro: "The blue shield app.",
    steps: [
      { text: "Open Trust Wallet." },
      {
        text: "Tap the coin that was taken — for example ETH or USDT.",
        screen: { title: "Home", rows: [{ text: "Ethereum", sub: "ETH", right: "0.00", tap: true }, { text: "Tether", sub: "USDT", right: "0.00" }] },
      },
      {
        text: "Tap the transfer you didn't make.",
        screen: { title: "ETH", rows: [{ text: "Transfer", sub: "To 0x9fd1…e6ac", right: "−4.98", tap: true, tone: "danger" }, { text: "Receive", right: "+0.5" }] },
      },
      {
        text: "Tap “More details”. A web page opens — copy the “Transaction Hash” (the long code starting with 0x).",
        screen: { title: "Transfer", rows: [{ text: "Date", right: "Today" }, { text: "Status", right: "Completed" }], button: { text: "More details", tap: true } },
      },
    ],
  },
  {
    id: "coinbase-wallet",
    name: "Coinbase Wallet",
    intro: "The blue app with a white circle — the wallet app, not the Coinbase exchange app.",
    steps: [
      { text: "Open Coinbase Wallet." },
      { text: "Find your activity or transactions list, and tap the transfer you didn't make.", screen: { title: "Activity", rows: [{ text: "Sent ETH", sub: "Today", right: "−4.98", tap: true, tone: "danger" }] } },
      { text: "Tap “View on block explorer” and copy the transaction hash that starts with 0x.", screen: { title: "Sent ETH", rows: [{ text: "Network fee", right: "0.001" }], button: { text: "View on block explorer", tap: true } } },
    ],
  },
  {
    id: "exchange",
    name: "An exchange app",
    intro: "Binance, Coinbase, WazirX, CoinDCX, Kraken and similar apps where you log in with email and password.",
    steps: [
      { text: "First, open the app's help or support chat from inside the app — never from a link someone sent you — and say: “My account was used to withdraw funds I did not authorise. Please freeze my account.”" },
      { text: "Change your password and turn on two-factor authentication." },
      {
        text: "Open your withdrawal history, tap the withdrawal you didn't make, and copy its “TxID”. Then start a case on Golden Hour with that TxID.",
        screen: { title: "Withdrawal details", rows: [{ text: "Amount", right: "−4.98 ETH", tone: "danger" }, { text: "TxID", sub: "0x13c7…e793", right: "copy", tap: true }] },
      },
    ],
  },
  {
    id: "dont-know",
    name: "I don't know",
    intro: "That's fine. If you know your wallet address — the code people use to send you money — Golden Hour can show you recent transfers and you just pick the one you didn't make.",
    steps: [
      { text: "Open your wallet and tap “Receive”. The code under the QR picture is your wallet address. It's safe to share — it's like an account number." },
      { text: "On Golden Hour, choose “I only know my wallet address”, paste the address, and tap the transfer you didn't make." },
      { text: "No wallet at all — you paid at a Bitcoin machine, by bank transfer, or through an app someone told you to install? Choose “I don't have anything like that”. Golden Hour writes your police report from your story, and tells you to call your bank." },
      { text: "Still stuck? Ask a family member or friend to sit with you and open this page together." },
    ],
  },
];

const WORDS: [string, string][] = [
  ["Wallet", "An app that holds your crypto, like a purse on your phone."],
  ["Wallet address", "A long code starting with 0x that people use to send you crypto. Safe to share — like an account number."],
  ["Recovery phrase (12 or 24 words)", "The master key to your wallet. Never type it into a website or tell it to anyone."],
  ["Transaction", "One transfer of money from one wallet to another."],
  ["Transaction ID (also “hash” or “TxID”)", "The receipt number of a transfer. A long code starting with 0x. Golden Hour needs this."],
  ["Exchange", "A company where people buy and sell crypto, like Binance or Coinbase. They know who their customers are."],
  ["Deposit address", "A wallet address an exchange gives to one customer. If stolen money lands there, the exchange can find that customer."],
  ["Freeze", "When an exchange stops an account from moving money, so it can't disappear while police investigate."],
  ["Hop", "One step in the trail. Thieves move money through many wallets to hide it; each move is a hop."],
];

const RED_FLAGS = [
  "They contact you first — on Telegram, WhatsApp, Instagram, X, or by email — after you posted about your loss.",
  "They promise to “recover” or “hack back” your crypto.",
  "They ask for an upfront fee, a “tax”, or a “gas fee” before releasing your money.",
  "They ask for your recovery phrase, or ask you to install an app or connect your wallet to a website.",
  "They claim to be from the police, a government agency, or “blockchain forensics” and want payment in crypto.",
];

export default function Help() {
  const [wallet, setWallet] = useState(WALLETS[0].id);
  const w = WALLETS.find((x) => x.id === wallet)!;
  return (
    <main id="main" className="relative min-h-screen" style={{ background: "radial-gradient(120% 70% at 50% 110%, #7a3040 0%, #2a1430 45%, #160c1c 80%)" }}>
      <Nav />
      <div className="relative z-10 mx-auto max-w-4xl px-5 pb-24 pt-32">
        <h1 className="serif text-5xl leading-[1.02] md:text-7xl">Help, in simple words.</h1>
        <p className="mt-5 max-w-2xl text-xl leading-9" style={{ color: "var(--mist)" }}>
          If money was taken from your crypto wallet, this page will walk you through what to do. Take your time. You can make the text bigger with the{" "}
          <b style={{ color: "var(--gold)" }}>Aa</b> button, or have it read to you.
        </p>
        <nav className="mt-8 flex flex-wrap gap-2 text-sm" aria-label="On this page">
          {[
            ["#now", "What to do right now"],
            ["#find-id", "Find the transaction ID"],
            ["#words", "What the words mean"],
            ["#scams", "Spot a “recovery” scam"],
            ["#family", "Helping someone else"],
            ["#after", "What happens next"],
          ].map(([h, t]) => (
            <a key={h} href={h} className="chip text-sm hover:text-[var(--gold)]">
              {t}
            </a>
          ))}
          <button className="chip text-sm" onClick={() => print()}>
            🖨 Print this guide
          </button>
        </nav>

        <Section id="now" title="What to do right now" read={NOW.map(([a, b]) => `${a} ${b}`).join(" ")}>
          <ol className="flex flex-col gap-4">
            {NOW.map(([t, d], i) => (
              <li key={t} className="glass flex gap-5 p-5 md:p-6">
                <span className="serif text-4xl" style={{ color: "var(--gold)" }}>
                  {i + 1}
                </span>
                <div>
                  <div className="text-xl font-medium">{t}</div>
                  <p className="mt-1 text-lg leading-8" style={{ color: "var(--mist)" }}>
                    {d}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="btn btn-sun" href="/#begin">
              Start my case
            </Link>
            <a className="btn btn-ghost" href="tel:1930">
              📞 India: call 1930
            </a>
          </div>
        </Section>

        <Section id="find-id" title="Find the transaction ID" read={`${w.name}. ${w.intro} ${w.steps.map((s, i) => `Step ${i + 1}. ${s.text}`).join(" ")}`}>
          <p className="text-lg leading-8" style={{ color: "var(--mist)" }}>
            Which app was the money taken from? Pick one. The buttons in your app may look a little different — look for words like <i>Activity</i>, <i>History</i> or{" "}
            <i>Transactions</i>.
          </p>
          <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Choose your wallet app">
            {WALLETS.map((x) => (
              <button key={x.id} role="tab" aria-selected={x.id === wallet} onClick={() => setWallet(x.id)} className={`btn ${x.id === wallet ? "btn-sun" : "btn-ghost"}`}>
                {x.name}
              </button>
            ))}
          </div>
          <p className="mt-6 text-lg" style={{ color: "var(--mist)" }}>
            {w.intro}
          </p>
          <ol className="mt-6 flex flex-col gap-5">
            {w.steps.map((s, i) => (
              <li key={i} className="glass flex flex-col gap-6 p-5 md:flex-row md:items-center md:p-7">
                <div className="flex flex-1 gap-5">
                  <span className="serif text-4xl" style={{ color: "var(--gold)" }}>
                    {i + 1}
                  </span>
                  <p className="text-xl leading-9">{s.text}</p>
                </div>
                {s.screen && <PhoneMock screen={s.screen} />}
              </li>
            ))}
          </ol>
          <div className="glass mt-6 p-5 text-lg leading-8">
            <b>What it looks like:</b> <span className="mono break-all text-base">0x13c78d3568cb403b26b94d8525cc75a7adb68e3f1def0a17fe846a23e86be793</span>
            <br />
            <span style={{ color: "var(--mist)" }}>It always starts with 0x and is 66 characters long. You don&apos;t need to read it — just copy and paste it.</span>
          </div>
        </Section>

        <Section id="words" title="What the words mean" read={WORDS.map(([a, b]) => `${a}: ${b}`).join(" ")}>
          <dl className="grid gap-4 md:grid-cols-2">
            {WORDS.map(([t, d]) => (
              <div key={t} className="glass p-5">
                <dt className="text-xl font-medium" style={{ color: "var(--gold)" }}>
                  {t}
                </dt>
                <dd className="mt-2 text-lg leading-8" style={{ color: "var(--mist)" }}>
                  {d}
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="scams" title="Spot a “recovery” scam" read={`Warning signs. ${RED_FLAGS.join(" ")}`}>
          <p className="text-lg leading-8" style={{ color: "var(--mist)" }}>
            After a theft, scammers look for victims to rob a second time. If you see any of these, stop and don&apos;t reply:
          </p>
          <ul className="mt-5 flex flex-col gap-3">
            {RED_FLAGS.map((f) => (
              <li key={f} className="glass flex gap-4 p-5 text-lg leading-8" style={{ borderColor: "rgba(255,138,122,0.35)" }}>
                <span aria-hidden style={{ color: "var(--danger)" }}>
                  ⚠
                </span>
                {f}
              </li>
            ))}
          </ul>
        </Section>

        <Section
          id="family"
          title="Helping a parent or grandparent"
          read="Sit with them and stay calm. Remind them it is not their fault. Do the steps together on their phone or yours. Use Golden Hour on their behalf — put their name and phone number in the letters. Then help them call the helpline and send the letters."
        >
          <ul className="flex flex-col gap-3 text-lg leading-8">
            {[
              "Sit with them and stay calm. Shame stops people asking for help — remind them it is not their fault.",
              "Do the steps together: find the transaction ID on their phone, then start a case on Golden Hour on their behalf — put their name and phone number in the letters.",
              "Help them make the call (1930 in India) and send the freeze request. Exchanges reply by email — check it with them.",
              "Afterwards: move anything left in that wallet to a new one, and set up a rule together: never install an app or “update” someone sends in a chat.",
            ].map((t) => (
              <li key={t} className="glass p-5">
                {t}
              </li>
            ))}
          </ul>
          <ShareBox />
        </Section>

        <Section
          id="after"
          title="What happens next"
          read="The exchange may freeze the account within hours or days, and will usually ask for a police report number. The police can request the account owner's identity from the exchange. Getting money back takes time and is not guaranteed — but acting fast gives you the best chance. Keep your evidence file safe."
        >
          <ol className="flex flex-col gap-3 text-lg leading-8">
            {[
              ["Within hours", "The exchange may freeze the account that received your money. They will usually ask for a police report number — that's why you file one."],
              ["Within days", "The police can ask the exchange who owns the account. The evidence file proves exactly where your money went."],
              ["Over weeks or months", "If the money is still frozen, it can be returned through the police or a court. It takes time, and it isn't guaranteed — but acting fast gives you the best chance."],
            ].map(([t, d]) => (
              <li key={t} className="glass p-5">
                <b style={{ color: "var(--gold)" }}>{t}.</b> <span style={{ color: "var(--mist)" }}>{d}</span>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-lg" style={{ color: "var(--mist)" }}>
            Keep the evidence file and your letters. If anyone asks whether they&apos;re genuine, send them to{" "}
            <Link href="/verify" className="link">
              the verify page
            </Link>
            .
          </p>
        </Section>
      </div>
      <Footer />
    </main>
  );
}

function Section({ id, title, read, children }: { id: string; title: string; read: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-20 scroll-mt-28">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <h2 className="serif text-4xl md:text-5xl">{title}</h2>
        <ReadAloud text={`${title}. ${read}`} label="Read aloud" />
      </div>
      {children}
    </section>
  );
}

function ShareBox() {
  const [done, setDone] = useState(false);
  const url = typeof window !== "undefined" ? `${location.origin}/help` : "/help";
  return (
    <div className="glass mt-6 flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
      <span className="text-lg">Send this guide to someone who can help you:</span>
      <button
        className="btn btn-sun"
        onClick={async () => {
          const text = "Someone took crypto from my wallet. This guide explains what to do — can you help me?";
          try {
            if (navigator.share) await navigator.share({ title: "Golden Hour — help", text, url });
            else await navigator.clipboard.writeText(`${text} ${url}`);
            setDone(true);
          } catch {
            /* user cancelled */
          }
        }}
      >
        {done ? "Ready to send ✓" : "Share this guide"}
      </button>
    </div>
  );
}
