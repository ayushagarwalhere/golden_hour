// "Is this a scam?" — checks a message, website or phone number someone sent the victim.
// Runs entirely in the browser: nothing the person pastes leaves their device.
//
// Rules are deliberately simple and explainable. Each one maps to a pattern that consumer-protection
// agencies warn about (recovery scams, pay-to-withdraw, "digital arrest", remote-access apps, secrecy).

import type { Lang } from "./i18n";

export type Severity = "stop" | "warn";
export type FlagId =
  | "recovery"
  | "fee"
  | "seed"
  | "remote"
  | "arrest"
  | "authority"
  | "secrecy"
  | "returns"
  | "payment"
  | "urgency"
  | "lookalike"
  | "badlink"
  | "wallet"
  | "chatapp";

type Text = Record<Lang, { title: string; why: string }>;

export const FLAGS: Record<FlagId, { severity: Severity; text: Text }> = {
  recovery: {
    severity: "stop",
    text: {
      en: { title: "They offer to get your lost money back", why: "Nobody can reverse crypto for a fee. “Recovery agents”, “hackers” and “lawyers” who contact you are a second scam aimed at people who already lost money." },
      hi: { title: "वे आपका खोया पैसा वापस दिलाने की बात करते हैं", why: "कोई भी फ़ीस लेकर क्रिप्टो वापस नहीं ला सकता। आपसे संपर्क करने वाले “रिकवरी एजेंट”, “हैकर” या “वकील” दूसरी ठगी हैं — उन लोगों के लिए जिनका पैसा पहले ही जा चुका है।" },
      es: { title: "Ofrecen recuperar su dinero perdido", why: "Nadie puede revertir cripto a cambio de una comisión. Los “agentes de recuperación”, “hackers” o “abogados” que le contactan son una segunda estafa dirigida a quien ya perdió dinero." },
    },
  },
  fee: {
    severity: "stop",
    text: {
      en: { title: "You must pay a fee or tax to get your money out", why: "Real platforms take fees out of your balance. Being asked to send more money first — “tax”, “unlock fee”, “verification deposit” — is the classic sign of a fake investment site." },
      hi: { title: "पैसा निकालने के लिए पहले फ़ीस या टैक्स भरने को कहा गया", why: "असली प्लेटफ़ॉर्म फ़ीस आपके बैलेंस से ही काटते हैं। पहले और पैसा भेजने को कहना — “टैक्स”, “अनलॉक फ़ीस”, “वेरिफ़िकेशन डिपॉज़िट” — नकली निवेश साइट की पहचान है।" },
      es: { title: "Debe pagar una comisión o impuesto para sacar su dinero", why: "Las plataformas reales descuentan las comisiones de su saldo. Que le pidan enviar más dinero antes — “impuesto”, “tarifa de desbloqueo”, “depósito de verificación” — es la señal clásica de una inversión falsa." },
    },
  },
  seed: {
    severity: "stop",
    text: {
      en: { title: "They ask for your secret words or private key", why: "Your 12 or 24 secret words are the key to your wallet. Anyone who has them can take everything. No real company, police officer or helper will ever ask." },
      hi: { title: "वे आपके गुप्त शब्द या प्राइवेट की माँगते हैं", why: "आपके 12 या 24 गुप्त शब्द वॉलेट की चाबी हैं। जिसके पास ये हैं, वह सब ले सकता है। कोई असली कंपनी, पुलिस या मददगार कभी नहीं माँगेगा।" },
      es: { title: "Piden sus palabras secretas o su clave privada", why: "Sus 12 o 24 palabras secretas son la llave de su billetera. Quien las tenga puede llevárselo todo. Ninguna empresa, policía o ayudante real se las pedirá nunca." },
    },
  },
  remote: {
    severity: "stop",
    text: {
      en: { title: "They want you to install a screen-sharing app", why: "Apps like AnyDesk or TeamViewer let a stranger control your phone or computer and move your money while you watch." },
      hi: { title: "वे स्क्रीन-शेयरिंग ऐप डालने को कहते हैं", why: "AnyDesk या TeamViewer जैसे ऐप से अजनबी आपका फ़ोन या कंप्यूटर चला सकता है और आपके सामने ही पैसा निकाल सकता है।" },
      es: { title: "Quieren que instale una app para compartir pantalla", why: "Apps como AnyDesk o TeamViewer permiten que un desconocido controle su teléfono u ordenador y mueva su dinero mientras usted mira." },
    },
  },
  arrest: {
    severity: "stop",
    text: {
      en: { title: "They threaten arrest or legal trouble", why: "Police and courts never arrest people over a video call, and never ask for money to “clear your name”. In India this is called a “digital arrest” scam." },
      hi: { title: "वे गिरफ़्तारी या कानूनी मुसीबत की धमकी देते हैं", why: "पुलिस या अदालत कभी वीडियो कॉल पर गिरफ़्तार नहीं करती, और “नाम साफ़ करने” के लिए पैसा नहीं माँगती। इसे “डिजिटल अरेस्ट” ठगी कहते हैं।" },
      es: { title: "Amenazan con arresto o problemas legales", why: "La policía y los tribunales nunca detienen a nadie por videollamada ni piden dinero para “limpiar su nombre”." },
    },
  },
  authority: {
    severity: "warn",
    text: {
      en: { title: "They say they are from the police, a bank, a government office or an exchange", why: "Scammers pretend to be people you trust. Hang up and call the organisation yourself, using the number on its official website or on your card." },
      hi: { title: "वे खुद को पुलिस, बैंक, सरकारी दफ़्तर या एक्सचेंज से बताते हैं", why: "ठग भरोसेमंद लोगों का रूप धरते हैं। फ़ोन काटें और उस संस्था को खुद फ़ोन करें — उसकी आधिकारिक वेबसाइट या आपके कार्ड पर लिखे नंबर पर।" },
      es: { title: "Dicen ser de la policía, un banco, el gobierno o un exchange", why: "Los estafadores se hacen pasar por gente de confianza. Cuelgue y llame usted a la organización, al número de su web oficial o de su tarjeta." },
    },
  },
  secrecy: {
    severity: "stop",
    text: {
      en: { title: "They tell you to keep it secret", why: "“Don't tell your bank or your family” is what scammers say so nobody can warn you. Talk to someone you trust right now." },
      hi: { title: "वे इसे राज़ रखने को कहते हैं", why: "“बैंक या परिवार को मत बताना” — ठग यह इसलिए कहते हैं ताकि कोई आपको सावधान न कर सके। अभी किसी भरोसेमंद व्यक्ति से बात करें।" },
      es: { title: "Le piden que lo mantenga en secreto", why: "“No se lo diga a su banco ni a su familia” es lo que dicen los estafadores para que nadie le avise. Hable ahora con alguien de confianza." },
    },
  },
  returns: {
    severity: "warn",
    text: {
      en: { title: "Guaranteed or very high profits", why: "Promises like “guaranteed”, “2% a day” or “double your money” are never real. This is how investment scams start." },
      hi: { title: "पक्का या बहुत ज़्यादा मुनाफ़ा", why: "“गारंटी”, “रोज़ 2%” या “पैसा दोगुना” जैसे वादे कभी सच नहीं होते। निवेश ठगी ऐसे ही शुरू होती है।" },
      es: { title: "Ganancias garantizadas o muy altas", why: "Promesas como “garantizado”, “2% al día” o “duplique su dinero” nunca son reales. Así empiezan las estafas de inversión." },
    },
  },
  payment: {
    severity: "stop",
    text: {
      en: { title: "They want payment by Bitcoin machine, gift card or crypto", why: "These payments can't be cancelled. Real banks, police and government offices never ask you to pay this way." },
      hi: { title: "वे बिटकॉइन मशीन, गिफ़्ट कार्ड या क्रिप्टो से भुगतान माँगते हैं", why: "ये भुगतान वापस नहीं होते। असली बैंक, पुलिस या सरकारी दफ़्तर कभी ऐसे भुगतान नहीं माँगते।" },
      es: { title: "Piden pago con cajero de Bitcoin, tarjetas regalo o cripto", why: "Estos pagos no se pueden cancelar. Bancos, policía y gobierno reales nunca piden pagar así." },
    },
  },
  urgency: {
    severity: "warn",
    text: {
      en: { title: "They rush you", why: "“Within 24 hours”, “last chance”, “your account will be blocked” — pressure is used so you don't stop and think. A real problem can wait for you to check." },
      hi: { title: "वे जल्दबाज़ी कराते हैं", why: "“24 घंटे में”, “आख़िरी मौका”, “आपका खाता बंद हो जाएगा” — दबाव इसलिए डाला जाता है ताकि आप रुककर सोचें नहीं। असली समस्या आपके जाँचने तक रुक सकती है।" },
      es: { title: "Le meten prisa", why: "“En 24 horas”, “última oportunidad”, “su cuenta será bloqueada” — la presión es para que no se pare a pensar. Un problema real puede esperar a que lo compruebe." },
    },
  },
  lookalike: {
    severity: "stop",
    text: {
      en: { title: "The website pretends to be a well-known company", why: "The link uses a famous name but isn't that company's real website. Type the company's address yourself instead of tapping links." },
      hi: { title: "वेबसाइट किसी मशहूर कंपनी जैसी दिखने का नाटक करती है", why: "लिंक में मशहूर नाम है, पर यह उस कंपनी की असली वेबसाइट नहीं है। लिंक दबाने के बजाय कंपनी का पता खुद टाइप करें।" },
      es: { title: "La web se hace pasar por una empresa conocida", why: "El enlace usa un nombre famoso pero no es la web real de esa empresa. Escriba usted la dirección de la empresa en vez de tocar enlaces." },
    },
  },
  badlink: {
    severity: "warn",
    text: {
      en: { title: "The link looks unusual", why: "Short links, number-only addresses and cheap web endings (.xyz, .top, .click…) are common in scams. Don't enter passwords or connect your wallet there." },
      hi: { title: "लिंक अजीब लगता है", why: "छोटे लिंक, सिर्फ़ नंबरों वाले पते और सस्ते वेब-अंत (.xyz, .top, .click…) ठगी में आम हैं। वहाँ पासवर्ड न डालें, वॉलेट न जोड़ें।" },
      es: { title: "El enlace parece raro", why: "Enlaces acortados, direcciones solo con números y terminaciones baratas (.xyz, .top, .click…) son comunes en estafas. No ponga contraseñas ni conecte su billetera ahí." },
    },
  },
  wallet: {
    severity: "warn",
    text: {
      en: { title: "It contains a crypto wallet address", why: "If you are being asked to send crypto to this address, stop. Crypto sent to a scammer almost never comes back." },
      hi: { title: "इसमें क्रिप्टो वॉलेट का पता है", why: "अगर आपसे इस पते पर क्रिप्टो भेजने को कहा जा रहा है, तो रुकिए। ठग को भेजा क्रिप्टो लगभग कभी वापस नहीं आता।" },
      es: { title: "Contiene una dirección de billetera cripto", why: "Si le piden enviar cripto a esta dirección, pare. La cripto enviada a un estafador casi nunca vuelve." },
    },
  },
  chatapp: {
    severity: "warn",
    text: {
      en: { title: "They moved you to WhatsApp or Telegram", why: "Real companies don't run support or investments through private WhatsApp or Telegram chats." },
      hi: { title: "उन्होंने आपको WhatsApp या Telegram पर बुलाया", why: "असली कंपनियाँ निजी WhatsApp या Telegram चैट से सपोर्ट या निवेश नहीं चलातीं।" },
      es: { title: "Le pasaron a WhatsApp o Telegram", why: "Las empresas reales no ofrecen soporte ni inversiones por chats privados de WhatsApp o Telegram." },
    },
  },
};

// Patterns in English, Hindi (Devanagari and common Hinglish) and Spanish.
const RULES: { id: FlagId; re: RegExp }[] = [
  { id: "recovery", re: /recover(y|ing)?\b.{0,40}(fund|crypto|money|asset|loss|bitcoin|usdt|scam)|(fund|crypto|asset|money|bitcoin)s?\s+recovery|get (your|ur) (money|funds?|crypto|bitcoin) back|retriev(e|al) (your|ur|the|lost|stolen)|hack(ed)? back|recovery (expert|agent|specialist|company|service)|ethical hacker|chargeback specialist|पैसा वापस|पैसे वापस|वापस (दिला|मिल)|recuperar (su|tu|sus|tus|el) (dinero|fondos|cripto)|recuperaci[oó]n de (fondos|activos|cripto)/i },
  { id: "fee", re: /(withdraw(al)?|unlock|release|clearance|verification|activation|upgrade)\s*(fee|tax|charge|deposit|amount)|(withdraw|release|unlock).{0,80}\b(pay|deposit|send)\b.{0,40}(tax|fee|commission|charge)|\b(pay|deposit)\b.{0,30}(tax|fee|commission|charge).{0,60}(withdraw|release|unlock|get (your|the) (money|funds|profit))|(tax|fee).{0,30}before.{0,20}withdraw|margin call|account (is )?frozen.{0,40}(pay|deposit)|निकासी (शुल्क|फ़ीस|फीस)|टैक्स (भर|जमा)|(comisi[oó]n|impuesto|tarifa).{0,30}(retir|desbloque|liberar)/i },
  { id: "seed", re: /seed phrase|recovery phrase|secret (recovery )?(phrase|words)|private key|(12|24|twelve|twenty[- ]four)[- ]words?|mnemonic|wallet (validation|sync|rectif)|validate (your )?wallet|गुप्त शब्द|सीड फ्रेज़|frase (semilla|de recuperaci[oó]n)|clave privada|palabras secretas/i },
  { id: "remote", re: /anydesk|teamviewer|quick ?support|rustdesk|ultraviewer|screen ?shar|remote (access|desktop|control)|airdroid|install (this|the) app.{0,30}(help|support)/i },
  { id: "arrest", re: /digital arrest|arrest warrant|warrant (for|against)|you (will|shall) be arrested|money laundering case|drug(s)? (parcel|package)|narcotics|illegal parcel|fedex.{0,30}(parcel|package).{0,30}(drug|illegal|customs)|\b(cbi|ncb|crime branch|interpol|fbi|cyber cell)\b.{0,40}(case|arrest|warrant|investigation)|डिजिटल अरेस्ट|गिरफ़्तार|गिरफ्तार|वारंट|arresto|orden de (arresto|detenci[oó]n)|lavado de dinero/i },
  { id: "authority", re: /\b(police|officer|inspector|cbi|fbi|interpol|customs|income tax|irs|hmrc|rbi|sebi|trai|ministry|government|court|judge|bank (manager|official|security)|fraud department)\b|(binance|coinbase|kraken|okx|bybit|kucoin|metamask|trust ?wallet|ledger|tether|blockchain) (support|team|security|compliance|agent|official)|पुलिस|अधिकारी|सरकार|अदालत|बैंक से|polic[ií]a|ministerio|gobierno|juzgado|tribunal/i },
  { id: "secrecy", re: /(don'?t|do not|never) (tell|inform|share (this|it) with|talk to) (anyone|anybody|your (family|bank|wife|husband|son|daughter|children|kids))|keep (this|it) (secret|confidential|between us)|confidential (case|matter|investigation)|किसी को (मत|न) बता|परिवार को (मत|न) बता|गुप्त रखें|no (se lo )?(diga|cuente) a (nadie|su (familia|banco))|mant[eé]ngalo en secreto/i },
  { id: "returns", re: /guarantee(d)? (profit|return|income)|risk[- ]free|\b\d{1,3}(\.\d+)?\s?% (daily|a day|per day|weekly|a week|per week)|double (your|ur) (money|investment|crypto)|(daily|weekly) (profit|return|income) of|passive income|vip (group|signal)|trading (mentor|signals?|expert)|पक्का मुनाफ़ा|गारंटी.{0,10}(मुनाफ़ा|रिटर्न)|पैसा दोगुना|ganancias? garantizadas?|sin riesgo|duplicar? (su|tu) dinero/i },
  { id: "payment", re: /bitcoin (atm|machine|kiosk)|crypto (atm|machine|kiosk)|coin ?(machine|atm)|gift ?cards?|itunes card|google play card|steam card|amazon card|pay (in|with|using) (bitcoin|btc|usdt|crypto)|send (the )?(bitcoin|btc|usdt|crypto) to|बिटकॉइन मशीन|गिफ़्ट कार्ड|गिफ्ट कार्ड|cajero (de )?bitcoin|tarjetas? (de )?regalo/i },
  { id: "urgency", re: /within (\d+|twenty[- ]four|one|1) ?(hour|hr|minute|min)s?|immediately|urgent(ly)?|right now|last chance|act now|expires? (today|soon)|(account|wallet|card) (will be )?(blocked|suspended|frozen|closed)|तुरंत|अभी के अभी|24 घंटे|खाता बंद|inmediatamente|urgente|[uú]ltima oportunidad|su cuenta (ser[aá] )?bloquead/i },
  { id: "wallet", re: /\b0x[a-fA-F0-9]{40}\b|\bT[1-9A-HJ-NP-Za-km-z]{33}\b|\b(bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/ },
  { id: "chatapp", re: /whats ?app|telegram|t\.me\/|wa\.me\/|signal app|व्हाट्सऐप|टेलीग्राम/i },
];

// Official domains of brands scammers copy. A link that uses one of these names on another domain is a look-alike.
const BRANDS: Record<string, string[]> = {
  binance: ["binance.com", "binance.us"],
  coinbase: ["coinbase.com"],
  kraken: ["kraken.com"],
  metamask: ["metamask.io"],
  trustwallet: ["trustwallet.com"],
  "trust-wallet": ["trustwallet.com"],
  ledger: ["ledger.com"],
  okx: ["okx.com"],
  bybit: ["bybit.com"],
  kucoin: ["kucoin.com"],
  tether: ["tether.to"],
  paypal: ["paypal.com"],
  amazon: ["amazon.com", "amazon.in", "amazon.co.uk", "amazon.es"],
  wazirx: ["wazirx.com"],
  coindcx: ["coindcx.com"],
  sbi: ["sbi.co.in", "onlinesbi.sbi"],
  hdfc: ["hdfcbank.com"],
  icici: ["icicibank.com"],
  cybercrime: ["cybercrime.gov.in"],
  ic3: ["ic3.gov"],
  actionfraud: ["actionfraud.police.uk"],
  uniswap: ["uniswap.org", "app.uniswap.org"],
  opensea: ["opensea.io"],
};
const CHEAP_TLD = /\.(xyz|top|click|online|site|live|icu|buzz|cfd|sbs|rest|shop|vip|loan|win|bid|monster|cyou|fun|space|website|ltd|cc|tk|ml|ga|cf|gq)$/i;
const SHORTENERS = /^(bit\.ly|tinyurl\.com|t\.co|cutt\.ly|rb\.gy|is\.gd|shorturl\.at|ow\.ly|tiny\.cc|s\.id|t\.ly)$/i;

export function hostsIn(text: string): string[] {
  const out = new Set<string>();
  const re = /\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}|(?:https?:\/\/)?\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?(?:\/[^\s]*)?/gi;
  for (const m of text.matchAll(re)) {
    const host = m[1].replace(/^https?:\/\//i, "").toLowerCase();
    if (/\.(jpg|png|gif|pdf)$/i.test(host) || /^\d+\.\d+$/.test(host)) continue;
    // a bare word.word must at least look like a domain (no "e.g")
    if (!/[a-z]{2,}$/.test(host) && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) continue;
    out.add(host.replace(/^www\./, ""));
  }
  return [...out];
}

export function linkFlags(host: string): FlagId[] {
  const flags: FlagId[] = [];
  const h = host.toLowerCase();
  const official = (d: string) => h === d || h.endsWith("." + d);
  for (const [brand, domains] of Object.entries(BRANDS)) {
    if (h.replace(/-/g, "").includes(brand.replace(/-/g, "")) && !domains.some(official)) {
      flags.push("lookalike");
      break;
    }
  }
  if (h.startsWith("xn--") || h.includes(".xn--")) flags.push("lookalike");
  if (CHEAP_TLD.test(h) || SHORTENERS.test(h) || /^\d{1,3}(\.\d{1,3}){3}$/.test(h)) flags.push("badlink");
  return [...new Set(flags)];
}

export type CheckResult = { verdict: "stop" | "careful" | "clear"; flags: FlagId[]; hosts: { host: string; flags: FlagId[] }[] };

export function checkMessage(text: string): CheckResult {
  const flags = new Set<FlagId>();
  for (const r of RULES) if (r.re.test(text)) flags.add(r.id);
  const hosts = hostsIn(text).map((host) => ({ host, flags: linkFlags(host) }));
  for (const h of hosts) h.flags.forEach((f) => flags.add(f));
  const list = [...flags].sort((a, b) => (FLAGS[a].severity === FLAGS[b].severity ? 0 : FLAGS[a].severity === "stop" ? -1 : 1));
  const stops = list.filter((f) => FLAGS[f].severity === "stop").length;
  const warns = list.length - stops;
  const verdict = stops > 0 || warns >= 3 ? "stop" : warns > 0 ? "careful" : "clear";
  return { verdict, flags: list, hosts };
}
