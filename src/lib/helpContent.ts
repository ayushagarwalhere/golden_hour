import type { MockScreen } from "@/components/PhoneMock";
import type { Lang } from "./i18n";

/* All the words on the /help guide, in every language.
   Written for someone who has never used crypto before, or who is helping a parent or grandparent:
   short sentences, no jargon without an explanation.
   The phone pictures (SCREENS) stay in English in every language — they show the real button names the apps use. */

export type HelpWallet = { id: string; name: string; intro: string; steps: { text: string; screen?: MockScreen }[] };
type Item = { t: string; d: string };

export type HelpContent = {
  title: string;
  /** text before and after the bold “Aa” */
  introA: string;
  introB: string;
  navLabel: string;
  nav: { now: string; findId: string; words: string; scams: string; family: string; after: string };
  print: string;
  readAloud: string;
  /** “Step” in “Step 1. …” when reading aloud */
  step: string;
  now: { title: string; items: Item[]; start: string; call: string };
  find: {
    title: string;
    /** pickA <i>Activity</i>, <i>History</i> pickOr <i>Transactions</i>pickB appLangNote */
    pickA: string;
    pickOr: string;
    pickB: string;
    appLangNote: string;
    tabsLabel: string;
    looksLike: string;
    looksNote: string;
  };
  wallets: HelpWallet[];
  words: { title: string; items: Item[] };
  scams: {
    title: string;
    intro: string;
    readPrefix: string;
    flags: string[];
    /** checkA <Link href="/check">checkLink</Link>checkB */
    checkA: string;
    checkLink: string;
    checkB: string;
  };
  family: { title: string; read: string; items: string[] };
  share: { prompt: string; text: string; title: string; button: string; done: string };
  after: {
    title: string;
    read: string;
    /** t already carries its own end punctuation */
    items: Item[];
    /** keepA <Link href="/verify">keepLink</Link>keepB */
    keepA: string;
    keepLink: string;
    keepB: string;
  };
};

const SCREENS = {
  mmWallet: { title: "Wallet", tabs: [{ text: "Tokens" }, { text: "NFTs" }, { text: "Activity", tap: true }], rows: [{ text: "ETH", right: "0.00" }, { text: "USDT", right: "0.00" }] },
  mmActivity: { title: "Activity", rows: [{ text: "Sent", sub: "Today, 4:03 pm", right: "−4.98 ETH", tap: true, tone: "danger" }, { text: "Received", sub: "12 Aug", right: "+0.5 ETH" }] },
  mmSent: { title: "Sent", rows: [{ text: "Status", right: "Confirmed" }, { text: "Amount", right: "−4.98 ETH", tone: "danger" }], button: { text: "Copy transaction ID", tap: true } },
  twHome: { title: "Home", rows: [{ text: "Ethereum", sub: "ETH", right: "0.00", tap: true }, { text: "Tether", sub: "USDT", right: "0.00" }] },
  twEth: { title: "ETH", rows: [{ text: "Transfer", sub: "To 0x9fd1…e6ac", right: "−4.98", tap: true, tone: "danger" }, { text: "Receive", right: "+0.5" }] },
  twTransfer: { title: "Transfer", rows: [{ text: "Date", right: "Today" }, { text: "Status", right: "Completed" }], button: { text: "More details", tap: true } },
  cbActivity: { title: "Activity", rows: [{ text: "Sent ETH", sub: "Today", right: "−4.98", tap: true, tone: "danger" }] },
  cbSent: { title: "Sent ETH", rows: [{ text: "Network fee", right: "0.001" }], button: { text: "View on block explorer", tap: true } },
  exWithdrawal: { title: "Withdrawal details", rows: [{ text: "Amount", right: "−4.98 ETH", tone: "danger" }, { text: "TxID", sub: "0x13c7…e793", right: "copy", tap: true }] },
} satisfies Record<string, MockScreen>;

const en: HelpContent = {
  title: "Help, in simple words.",
  introA: "If money was taken from your crypto wallet, this page will walk you through what to do. Take your time. You can make the text bigger with the ",
  introB: " button, or have it read to you.",
  navLabel: "On this page",
  nav: {
    now: "What to do right now",
    findId: "Find the transaction ID",
    words: "What the words mean",
    scams: "Spot a “recovery” scam",
    family: "Helping someone else",
    after: "What happens next",
  },
  print: "🖨 Print this guide",
  readAloud: "Read aloud",
  step: "Step",
  now: {
    title: "What to do right now",
    items: [
      { t: "Breathe. This is not your fault.", d: "These scams are run by professionals. Clever, careful people fall for them every day." },
      { t: "Don't send money to anyone who promises to get it back.", d: "People who message you offering to “recover” your crypto are almost always a second scam." },
      { t: "Never share your 12 or 24 secret words.", d: "That's your recovery phrase. Nobody real — not the police, not an exchange, not us — will ever ask for it." },
      {
        t: "Find the transaction ID if you can.",
        d: "It's a long code of letters and numbers, and it usually starts with 0x. The guide below shows you where to find it. Can't find it? Golden Hour still writes your police report from what you tell it.",
      },
      { t: "Use Golden Hour, then call for help.", d: "Golden Hour writes the letters for you. In India, also call 1930 — the free cyber-fraud helpline." },
    ],
    start: "Start my case",
    call: "📞 India: call 1930",
  },
  find: {
    title: "Find the transaction ID",
    pickA: "Which app was the money taken from? Pick one. The buttons in your app may look a little different — look for words like ",
    pickOr: "or",
    pickB: ".",
    appLangNote: "",
    tabsLabel: "Choose your wallet app",
    looksLike: "What it looks like:",
    looksNote:
      "It usually starts with 0x and is 66 characters long. On the Tron network (where most USDT is sent), it is 64 letters and numbers, with no 0x. You don't need to read it — just copy and paste it.",
  },
  wallets: [
    {
      id: "metamask",
      name: "MetaMask",
      intro: "The fox app. On a phone or as a browser add-on.",
      steps: [
        { text: "Open MetaMask and unlock it with your password." },
        { text: "Tap “Activity”. It's usually a tab under your balance or at the bottom of the screen.", screen: SCREENS.mmWallet },
        { text: "Tap the transfer you didn't make. It will say “Sent” or “Send”.", screen: SCREENS.mmActivity },
        { text: "Tap “Copy transaction ID” — or “View on block explorer”, then copy the long code starting with 0x.", screen: SCREENS.mmSent },
      ],
    },
    {
      id: "trust",
      name: "Trust Wallet",
      intro: "The blue shield app.",
      steps: [
        { text: "Open Trust Wallet." },
        { text: "Tap the coin that was taken — for example ETH or USDT.", screen: SCREENS.twHome },
        { text: "Tap the transfer you didn't make.", screen: SCREENS.twEth },
        { text: "Tap “More details”. A web page opens — copy the “Transaction Hash” (the long code, usually starting with 0x).", screen: SCREENS.twTransfer },
      ],
    },
    {
      id: "coinbase-wallet",
      name: "Coinbase Wallet",
      intro: "The blue app with a white circle — the wallet app, not the Coinbase exchange app.",
      steps: [
        { text: "Open Coinbase Wallet." },
        { text: "Find your activity or transactions list, and tap the transfer you didn't make.", screen: SCREENS.cbActivity },
        { text: "Tap “View on block explorer” and copy the transaction hash (the long code, usually starting with 0x).", screen: SCREENS.cbSent },
      ],
    },
    {
      id: "exchange",
      name: "An exchange app",
      intro: "Binance, Coinbase, WazirX, CoinDCX, Kraken and similar apps where you log in with email and password.",
      steps: [
        {
          text: "First, open the app's help or support chat from inside the app — never from a link someone sent you — and say: “My account was used to withdraw funds I did not authorise. Please freeze my account.”",
        },
        { text: "Change your password and turn on two-factor authentication." },
        {
          text: "Open your withdrawal history, tap the withdrawal you didn't make, and copy its “TxID”. Then start a case on Golden Hour with that TxID.",
          screen: SCREENS.exWithdrawal,
        },
      ],
    },
    {
      id: "dont-know",
      name: "I don't know",
      intro:
        "That's fine. If you know your wallet address — the code people use to send you money — Golden Hour can show you recent transfers and you just pick the one you didn't make.",
      steps: [
        {
          text: "Open your wallet and tap “Receive”. The code under the QR picture is your wallet address — it starts with 0x, or with T on Tron. It's safe to share — it's like an account number.",
        },
        { text: "On Golden Hour, choose “I only know my wallet address”, paste the address, and tap the transfer you didn't make." },
        {
          text: "No wallet at all — you paid at a Bitcoin machine, by bank transfer, or through an app someone told you to install? Choose “I don't have anything like that”. Golden Hour writes your police report from your story, and tells you to call your bank.",
        },
        { text: "Still stuck? Ask a family member or friend to sit with you and open this page together." },
      ],
    },
  ],
  words: {
    title: "What the words mean",
    items: [
      { t: "Wallet", d: "An app that holds your crypto, like a purse on your phone." },
      { t: "Wallet address", d: "A long code that people use to send you crypto. It starts with 0x — or with T on the Tron network. Safe to share — like an account number." },
      { t: "Recovery phrase (12 or 24 words)", d: "The master key to your wallet. Never type it into a website or tell it to anyone." },
      { t: "Transaction", d: "One transfer of money from one wallet to another." },
      { t: "Transaction ID (also “hash” or “TxID”)", d: "The receipt number of a transfer. A long code that usually starts with 0x (on Tron it has no 0x). Golden Hour needs this." },
      { t: "Exchange", d: "A company where people buy and sell crypto, like Binance or Coinbase. They know who their customers are." },
      { t: "Deposit address", d: "A wallet address an exchange gives to one customer. If stolen money lands there, the exchange can find that customer." },
      { t: "Freeze", d: "When an exchange stops an account from moving money, so it can't disappear while police investigate." },
      { t: "Hop", d: "One step in the trail. Thieves move money through many wallets to hide it; each move is a hop." },
      { t: "Tron", d: "Another crypto network. Most investment and romance scammers ask to be paid in USDT on Tron. Golden Hour can follow the money there too." },
      { t: "USDT and USDC", d: "Crypto coins meant to be worth about one US dollar. They are made by two companies, Tether and Circle, and those companies can freeze them." },
    ],
  },
  scams: {
    title: "Spot a “recovery” scam",
    intro: "After a theft, scammers look for victims to rob a second time. If you see any of these, stop and don't reply:",
    readPrefix: "Warning signs.",
    flags: [
      "They contact you first — on Telegram, WhatsApp, Instagram, X, or by email — after you posted about your loss.",
      "They promise to “recover” or “hack back” your crypto.",
      "They ask for an upfront fee, a “tax”, or a “gas fee” before releasing your money.",
      "They ask for your recovery phrase, or ask you to install an app or connect your wallet to a website.",
      "They claim to be from the police, a government agency, or “blockchain forensics” and want payment in crypto.",
    ],
    checkA: "Got a message and not sure? Paste it into ",
    checkLink: "Is this a scam?",
    checkB: " — it looks for these warning signs privately, right on your device.",
  },
  family: {
    title: "Helping a parent or grandparent",
    read: "Sit with them and stay calm. Remind them it is not their fault. Do the steps together on their phone or yours. Use Golden Hour on their behalf — put their name and phone number in the letters. Then help them call the helpline and send the letters.",
    items: [
      "Sit with them and stay calm. Shame stops people asking for help — remind them it is not their fault.",
      "Do the steps together: find the transaction ID on their phone, then start a case on Golden Hour on their behalf — put their name and phone number in the letters.",
      "Help them make the call (1930 in India) and send the freeze request. Exchanges reply by email — check it with them.",
      "Afterwards: move anything left in that wallet to a new one, and set up a rule together: never install an app or “update” someone sends in a chat.",
    ],
  },
  share: {
    prompt: "Send this guide to someone who can help you:",
    text: "Someone took crypto from my wallet. This guide explains what to do — can you help me?",
    title: "Golden Hour — help",
    button: "Share this guide",
    done: "Ready to send ✓",
  },
  after: {
    title: "What happens next",
    read: "The exchange may freeze the account within hours or days, and will usually ask for a police report number. The police can request the account owner's identity from the exchange. If USDT or USDC is still in the scammer's wallet, Golden Hour also writes a letter asking Tether or Circle to freeze it — the police usually send it. Getting money back takes time and is not guaranteed — but acting fast gives you the best chance. Keep your evidence file safe.",
    items: [
      { t: "Within hours.", d: "The exchange may freeze the account that received your money. They will usually ask for a police report number — that's why you file one." },
      {
        t: "Within days.",
        d: "The police can ask the exchange who owns the account. The evidence file proves exactly where your money went. If USDT or USDC is still in the scammer's wallet, Golden Hour also writes a letter asking Tether or Circle to freeze it — the police usually send it.",
      },
      {
        t: "Over weeks or months.",
        d: "If the money is still frozen, it can be returned through the police or a court. It takes time, and it isn't guaranteed — but acting fast gives you the best chance.",
      },
    ],
    keepA: "Keep the evidence file and your letters. If anyone asks whether they're genuine, send them to ",
    keepLink: "the verify page",
    keepB: ".",
  },
};

const hi: HelpContent = {
  title: "आसान शब्दों में मदद।",
  introA: "अगर आपके क्रिप्टो वॉलेट से पैसा चला गया है, तो यह पेज आपको बताएगा कि अब क्या करना है। आराम से, एक-एक करके पढ़ें। अक्षर बड़े करने के लिए ",
  introB: " बटन दबाएँ। आप इसे पढ़कर सुन भी सकते हैं।",
  navLabel: "इस पेज पर",
  nav: {
    now: "अभी क्या करें",
    findId: "ट्रांज़ैक्शन ID ढूँढें",
    words: "शब्दों का मतलब",
    scams: "“पैसा वापस दिलाने” वाली ठगी पहचानें",
    family: "किसी और की मदद करना",
    after: "आगे क्या होगा",
  },
  print: "🖨 यह गाइड प्रिंट करें",
  readAloud: "पढ़कर सुनाएँ",
  step: "चरण",
  now: {
    title: "अभी क्या करें",
    items: [
      { t: "गहरी साँस लें। इसमें आपकी कोई गलती नहीं है।", d: "यह ठगी पेशेवर लोग करते हैं। समझदार और सावधान लोग भी रोज़ इसका शिकार होते हैं।" },
      { t: "जो पैसा वापस दिलाने का वादा करे, उसे कोई पैसा न भेजें।", d: "जो लोग मैसेज करके आपका क्रिप्टो “वापस दिलाने” की बात करते हैं, वे लगभग हमेशा आपको दोबारा ठगना चाहते हैं।" },
      { t: "अपने 12 या 24 गुप्त शब्द कभी किसी को न बताएँ।", d: "यह आपका रिकवरी फ़्रेज़ है। कोई भी असली व्यक्ति — न पुलिस, न एक्सचेंज, न हम — इसे कभी नहीं माँगेगा।" },
      {
        t: "हो सके तो ट्रांज़ैक्शन ID ढूँढें।",
        d: "यह अक्षरों और अंकों का एक लंबा कोड होता है, जो अक्सर 0x से शुरू होता है। नीचे की गाइड बताती है कि यह कहाँ मिलेगा। नहीं मिल रहा? कोई बात नहीं — आप जो बताएँगे, उसी से Golden Hour आपकी पुलिस शिकायत लिख देगा।",
      },
      { t: "Golden Hour इस्तेमाल करें, फिर मदद के लिए फ़ोन करें।", d: "Golden Hour आपके लिए पत्र लिख देता है। भारत में 1930 पर भी कॉल करें — यह साइबर ठगी की मुफ़्त हेल्पलाइन है।" },
    ],
    start: "मेरा केस शुरू करें",
    call: "📞 भारत: 1930 पर कॉल करें",
  },
  find: {
    title: "ट्रांज़ैक्शन ID ढूँढें",
    pickA: "पैसा किस ऐप से गया? उसे चुनें। आपके ऐप के बटन थोड़े अलग दिख सकते हैं — ",
    pickOr: "या",
    pickB: " जैसे शब्द ढूँढें।",
    appLangNote: "अगर आपका ऐप हिंदी में है, तो बटनों पर यही बातें हिंदी में लिखी होंगी।",
    tabsLabel: "अपना वॉलेट ऐप चुनें",
    looksLike: "यह कुछ ऐसा दिखता है:",
    looksNote:
      "यह अक्सर 0x से शुरू होता है और 66 अक्षरों का होता है। Tron नेटवर्क पर (जहाँ ज़्यादातर USDT भेजा जाता है) इसमें 0x नहीं होता, और यह 64 अक्षरों और अंकों का होता है। इसे पढ़ने की ज़रूरत नहीं — बस कॉपी करके चिपका दें।",
  },
  wallets: [
    {
      id: "metamask",
      name: "MetaMask",
      intro: "लोमड़ी वाला ऐप। फ़ोन पर, या ब्राउज़र में ऐड-ऑन के रूप में।",
      steps: [
        { text: "MetaMask खोलें और अपने पासवर्ड से अनलॉक करें।" },
        { text: "“Activity” पर टैप करें। यह आमतौर पर आपके बैलेंस के नीचे, या स्क्रीन के सबसे नीचे एक टैब होता है।", screen: SCREENS.mmWallet },
        { text: "वह ट्रांसफ़र टैप करें जो आपने नहीं किया। उस पर “Sent” या “Send” लिखा होगा।", screen: SCREENS.mmActivity },
        { text: "“Copy transaction ID” पर टैप करें — या “View on block explorer” दबाएँ और 0x से शुरू होने वाला लंबा कोड कॉपी करें।", screen: SCREENS.mmSent },
      ],
    },
    {
      id: "trust",
      name: "Trust Wallet",
      intro: "नीली ढाल (शील्ड) वाला ऐप।",
      steps: [
        { text: "Trust Wallet खोलें।" },
        { text: "वह कॉइन टैप करें जो गया है — जैसे ETH या USDT।", screen: SCREENS.twHome },
        { text: "वह ट्रांसफ़र टैप करें जो आपने नहीं किया।", screen: SCREENS.twEth },
        { text: "“More details” पर टैप करें। एक वेब पेज खुलेगा — वहाँ से “Transaction Hash” कॉपी करें (लंबा कोड, जो अक्सर 0x से शुरू होता है)।", screen: SCREENS.twTransfer },
      ],
    },
    {
      id: "coinbase-wallet",
      name: "Coinbase Wallet",
      intro: "नीला ऐप जिसमें सफ़ेद गोला है — यह वॉलेट वाला ऐप है, Coinbase एक्सचेंज वाला ऐप नहीं।",
      steps: [
        { text: "Coinbase Wallet खोलें।" },
        { text: "अपनी Activity या ट्रांज़ैक्शन की सूची खोलें, और वह ट्रांसफ़र टैप करें जो आपने नहीं किया।", screen: SCREENS.cbActivity },
        { text: "“View on block explorer” पर टैप करें और transaction hash कॉपी करें (लंबा कोड, जो अक्सर 0x से शुरू होता है)।", screen: SCREENS.cbSent },
      ],
    },
    {
      id: "exchange",
      name: "कोई एक्सचेंज ऐप",
      intro: "Binance, Coinbase, WazirX, CoinDCX, Kraken जैसे ऐप, जिनमें आप ईमेल और पासवर्ड से लॉग इन करते हैं।",
      steps: [
        {
          text: "सबसे पहले, ऐप के अंदर से ही उसकी हेल्प या सपोर्ट चैट खोलें — किसी के भेजे लिंक से कभी नहीं — और लिखें: “My account was used to withdraw funds I did not authorise. Please freeze my account.” (मतलब: मेरे खाते से मेरी इजाज़त के बिना पैसे निकाले गए हैं। कृपया मेरा खाता फ़्रीज़ करें।)",
        },
        { text: "अपना पासवर्ड बदलें और टू-फ़ैक्टर ऑथेंटिकेशन (2FA) चालू करें।" },
        {
          text: "अपनी withdrawal history (पैसे निकालने की सूची) खोलें, वह withdrawal टैप करें जो आपने नहीं किया, और उसका “TxID” कॉपी करें। फिर उस TxID से Golden Hour पर केस शुरू करें।",
          screen: SCREENS.exWithdrawal,
        },
      ],
    },
    {
      id: "dont-know",
      name: "मुझे नहीं पता",
      intro: "कोई बात नहीं। अगर आपको अपना वॉलेट पता मालूम है — वह कोड जिस पर लोग आपको पैसे भेजते हैं — तो Golden Hour आपको हाल के ट्रांसफ़र दिखा देगा। आप बस वह चुनें जो आपने नहीं किया।",
      steps: [
        {
          text: "अपना वॉलेट खोलें और “Receive” पर टैप करें। QR तस्वीर के नीचे जो कोड है, वही आपका वॉलेट पता है — यह 0x से शुरू होता है, या Tron पर T से। इसे बताना सुरक्षित है — यह बैंक खाता नंबर जैसा है।",
        },
        { text: "Golden Hour पर “मुझे सिर्फ़ अपना वॉलेट पता मालूम है” चुनें, पता चिपकाएँ, और वह ट्रांसफ़र टैप करें जो आपने नहीं किया।" },
        {
          text: "आपके पास कोई वॉलेट ही नहीं है — आपने Bitcoin मशीन पर, बैंक ट्रांसफ़र से, या किसी के कहने पर इंस्टॉल किए ऐप से पैसे दिए थे? तो “मेरे पास ऐसा कुछ नहीं है” चुनें। Golden Hour आपकी बताई बात से पुलिस शिकायत लिख देगा, और आपको अपने बैंक को फ़ोन करने को कहेगा।",
        },
        { text: "फिर भी समझ नहीं आ रहा? परिवार के किसी सदस्य या दोस्त को पास बैठाएँ और यह पेज साथ में खोलें।" },
      ],
    },
  ],
  words: {
    title: "शब्दों का मतलब",
    items: [
      { t: "वॉलेट", d: "एक ऐप जिसमें आपका क्रिप्टो रहता है — जैसे फ़ोन में एक बटुआ।" },
      { t: "वॉलेट पता (वॉलेट एड्रेस)", d: "एक लंबा कोड जिस पर लोग आपको क्रिप्टो भेजते हैं। यह 0x से शुरू होता है — या Tron नेटवर्क पर T से। इसे बताना सुरक्षित है — जैसे बैंक खाता नंबर।" },
      { t: "रिकवरी फ़्रेज़ (12 या 24 शब्द)", d: "आपके वॉलेट की असली चाबी। इसे कभी किसी वेबसाइट पर न लिखें, और न किसी को बताएँ।" },
      { t: "ट्रांज़ैक्शन", d: "एक वॉलेट से दूसरे वॉलेट में पैसे का एक ट्रांसफ़र।" },
      { t: "ट्रांज़ैक्शन ID (इसे “hash” या “TxID” भी कहते हैं)", d: "ट्रांसफ़र की रसीद का नंबर। एक लंबा कोड, जो अक्सर 0x से शुरू होता है (Tron पर इसमें 0x नहीं होता)। Golden Hour को इसकी ज़रूरत होती है।" },
      { t: "एक्सचेंज", d: "एक कंपनी जहाँ लोग क्रिप्टो खरीदते-बेचते हैं, जैसे Binance या Coinbase। इन्हें पता होता है कि इनके ग्राहक कौन हैं।" },
      { t: "डिपॉज़िट पता", d: "वह वॉलेट पता जो एक्सचेंज अपने किसी एक ग्राहक को देता है। अगर चोरी का पैसा वहाँ पहुँचे, तो एक्सचेंज उस ग्राहक का पता लगा सकता है।" },
      { t: "फ़्रीज़", d: "जब एक्सचेंज किसी खाते से पैसा हिलने से रोक देता है, ताकि पुलिस की जाँच के दौरान पैसा गायब न हो।" },
      { t: "हॉप", d: "पैसे के रास्ते का एक कदम। चोर पैसा छिपाने के लिए उसे कई वॉलेट से घुमाते हैं; हर बार का घुमाव एक हॉप है।" },
      { t: "Tron", d: "एक और क्रिप्टो नेटवर्क। निवेश और रोमांस वाली ज़्यादातर ठगी में पैसा Tron पर USDT में माँगा जाता है। Golden Hour वहाँ भी पैसे का पीछा कर सकता है।" },
      { t: "USDT और USDC", d: "ऐसे क्रिप्टो सिक्के जिनकी कीमत लगभग 1 अमेरिकी डॉलर रहती है। इन्हें दो कंपनियाँ बनाती हैं — Tether और Circle — और ये कंपनियाँ इन्हें फ़्रीज़ कर सकती हैं।" },
    ],
  },
  scams: {
    title: "“पैसा वापस दिलाने” वाली ठगी पहचानें",
    intro: "चोरी के बाद ठग ऐसे लोगों को ढूँढते हैं जिन्हें दोबारा लूटा जा सके। इनमें से कुछ भी दिखे, तो रुक जाएँ और जवाब न दें:",
    readPrefix: "चेतावनी के संकेत।",
    flags: [
      "वे खुद पहले संपर्क करते हैं — Telegram, WhatsApp, Instagram, X या ईमेल पर — जब आपने अपने नुकसान के बारे में कहीं लिखा हो।",
      "वे आपका क्रिप्टो “वापस दिलाने” या “हैक करके वापस लाने” का वादा करते हैं।",
      "पैसा छुड़ाने से पहले वे फ़ीस, “टैक्स” या “गैस फ़ीस” माँगते हैं।",
      "वे आपका रिकवरी फ़्रेज़ माँगते हैं, या कोई ऐप इंस्टॉल करने या अपना वॉलेट किसी वेबसाइट से जोड़ने को कहते हैं।",
      "वे खुद को पुलिस, किसी सरकारी विभाग या “ब्लॉकचेन फ़ॉरेंसिक्स” से बताते हैं और क्रिप्टो में पैसे माँगते हैं।",
    ],
    checkA: "कोई मैसेज आया है और पक्का नहीं पता? उसे ",
    checkLink: "क्या यह ठगी है?",
    checkB: " पेज में चिपकाएँ — वह इन चेतावनी के संकेतों को आपके अपने फ़ोन या कंप्यूटर पर ही, निजी तौर पर जाँचता है।",
  },
  family: {
    title: "माता-पिता या दादा-दादी की मदद करना",
    read: "उनके पास बैठें और शांत रहें। उन्हें याद दिलाएँ कि इसमें उनकी कोई गलती नहीं है। सारे कदम साथ में करें, उनके फ़ोन पर या अपने फ़ोन पर। उनकी तरफ़ से Golden Hour इस्तेमाल करें — पत्रों में उनका नाम और फ़ोन नंबर डालें। फिर हेल्पलाइन पर फ़ोन करने और पत्र भेजने में उनकी मदद करें।",
    items: [
      "उनके पास बैठें और शांत रहें। शर्म की वजह से लोग मदद नहीं माँगते — उन्हें याद दिलाएँ कि इसमें उनकी कोई गलती नहीं है।",
      "सारे कदम साथ में करें: उनके फ़ोन पर ट्रांज़ैक्शन ID ढूँढें, फिर उनकी तरफ़ से Golden Hour पर केस शुरू करें — पत्रों में उनका नाम और फ़ोन नंबर डालें।",
      "फ़ोन करने में उनकी मदद करें (भारत में 1930) और फ़्रीज़ का अनुरोध भेजें। एक्सचेंज ईमेल से जवाब देते हैं — उनके साथ ईमेल देखते रहें।",
      "बाद में: उस वॉलेट में जो कुछ बचा है उसे नए वॉलेट में भेज दें, और साथ मिलकर एक नियम बनाएँ: चैट में कोई ऐप या “अपडेट” भेजे, तो उसे कभी इंस्टॉल नहीं करना।",
    ],
  },
  share: {
    prompt: "यह गाइड किसी ऐसे व्यक्ति को भेजें जो आपकी मदद कर सके:",
    text: "किसी ने मेरे वॉलेट से क्रिप्टो ले लिया है। इस गाइड में लिखा है कि क्या करना है — क्या आप मेरी मदद करेंगे?",
    title: "Golden Hour — मदद",
    button: "यह गाइड भेजें",
    done: "भेजने के लिए तैयार ✓",
  },
  after: {
    title: "आगे क्या होगा",
    read: "एक्सचेंज कुछ घंटों या दिनों में खाता फ़्रीज़ कर सकता है, और अक्सर पुलिस शिकायत का नंबर माँगता है। पुलिस एक्सचेंज से खाते के मालिक की पहचान माँग सकती है। अगर USDT या USDC अभी भी ठग के वॉलेट में है, तो Golden Hour Tether या Circle को उसे फ़्रीज़ करने के लिए एक पत्र भी लिख देता है — इसे आमतौर पर पुलिस भेजती है। पैसा वापस मिलने में समय लगता है और इसकी गारंटी नहीं है — लेकिन जल्दी कदम उठाने से सबसे अच्छा मौका मिलता है। अपनी सबूत की फ़ाइल संभालकर रखें।",
    items: [
      { t: "कुछ घंटों में:", d: "जिस खाते में आपका पैसा गया, एक्सचेंज उसे फ़्रीज़ कर सकता है। वे अक्सर पुलिस शिकायत का नंबर माँगते हैं — इसीलिए शिकायत दर्ज करना ज़रूरी है।" },
      {
        t: "कुछ दिनों में:",
        d: "पुलिस एक्सचेंज से पूछ सकती है कि खाता किसका है। सबूत की फ़ाइल ठीक-ठीक दिखाती है कि आपका पैसा कहाँ गया। अगर USDT या USDC अभी भी ठग के वॉलेट में है, तो Golden Hour Tether या Circle को उसे फ़्रीज़ करने के लिए एक पत्र भी लिख देता है — इसे आमतौर पर पुलिस भेजती है।",
      },
      {
        t: "कुछ हफ़्तों या महीनों में:",
        d: "अगर पैसा फ़्रीज़ रहता है, तो पुलिस या अदालत के ज़रिए उसे लौटाया जा सकता है। इसमें समय लगता है, और इसकी कोई गारंटी नहीं — लेकिन जल्दी कदम उठाने से सबसे अच्छा मौका मिलता है।",
      },
    ],
    keepA: "सबूत की फ़ाइल और अपने पत्र संभालकर रखें। अगर कोई पूछे कि ये असली हैं या नहीं, तो उन्हें ",
    keepLink: "जाँच वाले पेज",
    keepB: " पर भेजें।",
  },
};

const es: HelpContent = {
  title: "Ayuda, en palabras sencillas.",
  introA: "Si le quitaron dinero de su billetera de cripto, esta página le explica paso a paso qué hacer. Tómese su tiempo. Puede agrandar la letra con el botón ",
  introB: ", o pedir que se la lean en voz alta.",
  navLabel: "En esta página",
  nav: {
    now: "Qué hacer ahora mismo",
    findId: "Encontrar el ID de la transacción",
    words: "Qué significan las palabras",
    scams: "Detectar una estafa de “recuperación”",
    family: "Ayudar a otra persona",
    after: "Qué pasa después",
  },
  print: "🖨 Imprimir esta guía",
  readAloud: "Leer en voz alta",
  step: "Paso",
  now: {
    title: "Qué hacer ahora mismo",
    items: [
      { t: "Respire. No es su culpa.", d: "Estas estafas las hacen profesionales. Personas listas y cuidadosas caen en ellas todos los días." },
      { t: "No envíe dinero a nadie que prometa recuperarlo.", d: "Quienes le escriben ofreciendo “recuperar” su cripto casi siempre son una segunda estafa." },
      { t: "Nunca comparta sus 12 o 24 palabras secretas.", d: "Es su frase de recuperación. Nadie de verdad —ni la policía, ni un exchange, ni nosotros— se la pedirá jamás." },
      {
        t: "Si puede, busque el ID de la transacción.",
        d: "Es un código largo de letras y números, y casi siempre empieza con 0x. La guía de abajo le muestra dónde encontrarlo. ¿No lo encuentra? Golden Hour igual escribe su denuncia policial con lo que usted le cuente.",
      },
      { t: "Use Golden Hour y luego pida ayuda por teléfono.", d: "Golden Hour escribe las cartas por usted. En la India, llame también al 1930, la línea gratuita contra el fraude cibernético." },
    ],
    start: "Empezar mi caso",
    call: "📞 India: llame al 1930",
  },
  find: {
    title: "Encontrar el ID de la transacción",
    pickA: "¿De qué app le quitaron el dinero? Elija una. Los botones de su app pueden verse un poco distintos; busque palabras como ",
    pickOr: "o",
    pickB: ".",
    appLangNote: "Si su app está en español, verá esas mismas palabras en español (por ejemplo, “Actividad” en lugar de “Activity”).",
    tabsLabel: "Elija su app de billetera",
    looksLike: "Así se ve:",
    looksNote:
      "Casi siempre empieza con 0x y tiene 66 caracteres. En la red Tron (donde se envía la mayoría de USDT), tiene 64 letras y números, sin 0x. No hace falta leerlo: solo cópielo y péguelo.",
  },
  wallets: [
    {
      id: "metamask",
      name: "MetaMask",
      intro: "La app del zorro. En el teléfono o como extensión del navegador.",
      steps: [
        { text: "Abra MetaMask y desbloquéela con su contraseña." },
        { text: "Toque “Activity”. Suele ser una pestaña debajo de su saldo o en la parte de abajo de la pantalla.", screen: SCREENS.mmWallet },
        { text: "Toque la transferencia que usted no hizo. Dirá “Sent” o “Send”.", screen: SCREENS.mmActivity },
        { text: "Toque “Copy transaction ID”, o toque “View on block explorer” y copie el código largo que empieza con 0x.", screen: SCREENS.mmSent },
      ],
    },
    {
      id: "trust",
      name: "Trust Wallet",
      intro: "La app del escudo azul.",
      steps: [
        { text: "Abra Trust Wallet." },
        { text: "Toque la moneda que le quitaron; por ejemplo, ETH o USDT.", screen: SCREENS.twHome },
        { text: "Toque la transferencia que usted no hizo.", screen: SCREENS.twEth },
        { text: "Toque “More details”. Se abre una página web: copie el “Transaction Hash” (el código largo, que casi siempre empieza con 0x).", screen: SCREENS.twTransfer },
      ],
    },
    {
      id: "coinbase-wallet",
      name: "Coinbase Wallet",
      intro: "La app azul con un círculo blanco. Es la app de billetera, no la app del exchange Coinbase.",
      steps: [
        { text: "Abra Coinbase Wallet." },
        { text: "Busque su actividad o su lista de transacciones, y toque la transferencia que usted no hizo.", screen: SCREENS.cbActivity },
        { text: "Toque “View on block explorer” y copie el hash de la transacción (el código largo, que casi siempre empieza con 0x).", screen: SCREENS.cbSent },
      ],
    },
    {
      id: "exchange",
      name: "Una app de exchange",
      intro: "Binance, Coinbase, WazirX, CoinDCX, Kraken y apps parecidas donde usted entra con su correo y una contraseña.",
      steps: [
        {
          text: "Primero, abra la ayuda o el chat de soporte desde dentro de la app —nunca desde un enlace que alguien le envió— y escriba: “Usaron mi cuenta para retirar fondos que yo no autoricé. Por favor, congelen mi cuenta.”",
        },
        { text: "Cambie su contraseña y active la verificación en dos pasos." },
        {
          text: "Abra su historial de retiros, toque el retiro que usted no hizo y copie su “TxID”. Luego empiece un caso en Golden Hour con ese TxID.",
          screen: SCREENS.exWithdrawal,
        },
      ],
    },
    {
      id: "dont-know",
      name: "No lo sé",
      intro:
        "No pasa nada. Si sabe la dirección de su billetera —el código que la gente usa para enviarle dinero—, Golden Hour puede mostrarle las transferencias recientes y usted solo elige la que no hizo.",
      steps: [
        {
          text: "Abra su billetera y toque “Receive”. El código debajo del dibujo QR es la dirección de su billetera: empieza con 0x, o con T en Tron. Es seguro compartirla; es como un número de cuenta.",
        },
        { text: "En Golden Hour, elija “Solo sé la dirección de mi billetera”, pegue la dirección y toque la transferencia que usted no hizo." },
        {
          text: "¿No tiene billetera? ¿Pagó en un cajero de Bitcoin, por transferencia bancaria o con una app que alguien le pidió instalar? Elija “No tengo nada de eso”. Golden Hour escribe su denuncia policial a partir de lo que usted cuente, y le indica que llame a su banco.",
        },
        { text: "¿Sigue sin saber qué hacer? Pida a un familiar o a un amigo que se siente con usted y abran esta página juntos." },
      ],
    },
  ],
  words: {
    title: "Qué significan las palabras",
    items: [
      { t: "Billetera (wallet)", d: "Una app que guarda su cripto, como un monedero en su teléfono." },
      { t: "Dirección de la billetera", d: "Un código largo que la gente usa para enviarle cripto. Empieza con 0x, o con T en la red Tron. Es seguro compartirla, como un número de cuenta." },
      { t: "Frase de recuperación (12 o 24 palabras)", d: "La llave maestra de su billetera. Nunca la escriba en una página web ni se la diga a nadie." },
      { t: "Transacción", d: "Una transferencia de dinero de una billetera a otra." },
      { t: "ID de la transacción (también “hash” o “TxID”)", d: "El número de recibo de una transferencia. Un código largo que casi siempre empieza con 0x (en Tron no lleva 0x). Golden Hour lo necesita." },
      { t: "Exchange", d: "Una empresa donde la gente compra y vende cripto, como Binance o Coinbase. Saben quiénes son sus clientes." },
      { t: "Dirección de depósito", d: "Una dirección de billetera que un exchange le da a un solo cliente. Si el dinero robado llega ahí, el exchange puede encontrar a ese cliente." },
      { t: "Congelar", d: "Cuando un exchange impide que una cuenta mueva dinero, para que no desaparezca mientras la policía investiga." },
      { t: "Salto", d: "Un paso en el rastro. Los ladrones mueven el dinero por muchas billeteras para esconderlo; cada movimiento es un salto." },
      { t: "Tron", d: "Otra red de cripto. La mayoría de las estafas de inversión y románticas piden el pago en USDT en Tron. Golden Hour también puede seguir el dinero ahí." },
      { t: "USDT y USDC", d: "Monedas cripto que valen más o menos un dólar estadounidense. Las emiten dos empresas, Tether y Circle, y esas empresas pueden congelarlas." },
    ],
  },
  scams: {
    title: "Detectar una estafa de “recuperación”",
    intro: "Después de un robo, los estafadores buscan víctimas para robarles otra vez. Si ve cualquiera de estas señales, deténgase y no responda:",
    readPrefix: "Señales de alerta.",
    flags: [
      "Le contactan primero —por Telegram, WhatsApp, Instagram, X o correo electrónico— después de que usted contó su pérdida en internet.",
      "Prometen “recuperar” su cripto o “hackear” al ladrón para devolvérsela.",
      "Le piden un pago por adelantado, un “impuesto” o una “comisión de gas” antes de liberar su dinero.",
      "Le piden su frase de recuperación, o que instale una app o conecte su billetera a una página web.",
      "Dicen ser de la policía, de una agencia del gobierno o de un servicio de “análisis forense de blockchain”, y quieren el pago en cripto.",
    ],
    checkA: "¿Recibió un mensaje y no está seguro? Péguelo en ",
    checkLink: "¿Es una estafa?",
    checkB: ". Busca estas señales de alerta de forma privada, en su propio dispositivo.",
  },
  family: {
    title: "Cómo ayudar a sus padres o abuelos",
    read: "Siéntese con la persona y mantenga la calma. Recuérdele que no es su culpa. Hagan los pasos juntos, en su teléfono o en el de usted. Use Golden Hour en su nombre: ponga su nombre y su número de teléfono en las cartas. Luego ayúdele a llamar a la línea de ayuda y a enviar las cartas.",
    items: [
      "Siéntese con la persona y mantenga la calma. La vergüenza hace que la gente no pida ayuda: recuérdele que no es su culpa.",
      "Hagan los pasos juntos: busquen el ID de la transacción en su teléfono y luego empiece un caso en Golden Hour en su nombre. Ponga su nombre y su número de teléfono en las cartas.",
      "Ayúdele a hacer la llamada (el 1930 en la India) y a enviar la solicitud de congelamiento. Los exchanges responden por correo: revíselo con la persona.",
      "Después: pasen lo que quede en esa billetera a una nueva, y pónganse juntos una regla: nunca instalar una app o una “actualización” que alguien envíe por chat.",
    ],
  },
  share: {
    prompt: "Envíe esta guía a alguien que pueda ayudarle:",
    text: "Alguien se llevó cripto de mi billetera. Esta guía explica qué hacer. ¿Me puede ayudar?",
    title: "Golden Hour — ayuda",
    button: "Compartir esta guía",
    done: "Lista para enviar ✓",
  },
  after: {
    title: "Qué pasa después",
    read: "El exchange puede congelar la cuenta en unas horas o días, y normalmente pedirá un número de denuncia policial. La policía puede pedirle al exchange la identidad del dueño de la cuenta. Si todavía hay USDT o USDC en la billetera del estafador, Golden Hour también escribe una carta para pedir a Tether o Circle que lo congelen; normalmente la envía la policía. Recuperar el dinero lleva tiempo y no está garantizado, pero actuar rápido le da la mejor oportunidad. Guarde bien su archivo de pruebas.",
    items: [
      { t: "En unas horas.", d: "El exchange puede congelar la cuenta que recibió su dinero. Normalmente pedirá un número de denuncia policial; por eso conviene presentarla." },
      {
        t: "En unos días.",
        d: "La policía puede preguntarle al exchange quién es el dueño de la cuenta. El archivo de pruebas muestra exactamente adónde fue su dinero. Si todavía hay USDT o USDC en la billetera del estafador, Golden Hour también escribe una carta para pedir a Tether o Circle que lo congelen; normalmente la envía la policía.",
      },
      {
        t: "En semanas o meses.",
        d: "Si el dinero sigue congelado, se puede devolver a través de la policía o de un juez. Lleva tiempo y no está garantizado, pero actuar rápido le da la mejor oportunidad.",
      },
    ],
    keepA: "Guarde el archivo de pruebas y sus cartas. Si alguien pregunta si son auténticos, envíelo a ",
    keepLink: "la página de verificación",
    keepB: ".",
  },
};

export const HELP: Record<Lang, HelpContent> = { en, hi, es };
