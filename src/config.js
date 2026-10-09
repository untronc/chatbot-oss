// サイトごとの設定を受け取り、既定の値で埋めて、足りないものがあれば起動の前に止める。
// 設定の書き方は docs/configuration.md。見本は sites/example/site.config.js。

const DEFAULTS = {
  ai: {
    model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    maxTokens: 400, // 300 では日本語の答えが文の途中で切れることがあった
    maxHistoryMessages: 8, // AI に渡す直近の会話の件数（質問と答えを1件ずつ数える）
    maxMessageLength: 500,
  },
  limits: {
    perIpPerDay: 20, // 同じ IP から1日に AI を呼べる回数
    sitePerDay: 77, // サイト全体で1日に AI を呼べる回数（Workers AI の無料枠 10,000 ニューロン ÷ 1回約130）
    contactsPerIpPerDay: 3,
  },
  retentionDays: 365,
  prompt: {
    unansweredPhrase: "申し訳ありません、その内容はこちらではお答えできません。",
    contactTag: "[受付]",
    leakMarkers: [],
  },
  contact: {
    intent: /相談|見積|依頼|問い合わせ|問合せ|申し込|申込|お願いしたい|頼みたい|(だと|の場合|なら|場合は).{0,8}(いくら|費用|料金|金額)|うちの|弊社|当社|自社/,
    reply: "個別のご相談として承ります。下の「問い合わせる」から、お名前・メールアドレス・ご相談の内容をお送りください。",
    listedOnly: [],
    topics: [],
    fallbackTopic: "その他のご相談",
    maxName: 50,
    maxMessage: 2000,
    maxTranscript: 20,
  },
  allowedYen: [],
  messages: {
    tooLong: (max) => `恐れ入りますが、${max}文字以内でお願いします。`,
    perIpLimit: "本日分のご利用回数の上限に達しました。ご相談は、下の「問い合わせる」から承ります。",
    siteLimit: "本日はAIでのご案内を終了しました。ご相談は、下の「問い合わせる」から承ります。",
    aiError: (contactUrl) =>
      `申し訳ありません、ただいま混み合っております。\nお急ぎの場合はお問い合わせフォームからご連絡ください。\n${contactUrl}`,
  },
  widget: {
    storagePrefix: "chat-fairy",
    theme: {
      primary: "#2b724c", // 見出し・自分の吹き出し・ボタン
      primarySoft: "#eef2ef", // ボタンを押す前に重ねたとき
      surface: "#f3f6f4", // 会話の地
      border: "#dbe3de", // 吹き出し・確認の枠
      inputBorder: "#cad3ce", // 入力欄・アイコンの枠
      divider: "#e3e9e5", // 入力欄の上の線
      closeIcon: "#6d3c29", // 閉じるボタンの ×
      text: "#2b2320",
      muted: "#6f5f5a",
    },
    font: {
      family: '"BIZ UDPGothic", "Noto Sans JP", sans-serif',
      stylesheet: "https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&display=swap",
    },
    images: {
      body: "/guide-body.svg",
      wingL: "/guide-wing-l.svg",
      wingR: "/guide-wing-r.svg",
      face: "/guide-face.svg",
    },
    layout: {
      headerSelector: "header", // 案内役がこの下から動き出す（メニューに重ねないため）
      bottomAnchor: null, // { wrap: ".p-fixBtnWrap", button: ".c-fixBtn" } のように書くと、その上で止まる
      moveOnPaths: null, // ["/"] のように書くと、そのページだけ上から下へ動き、ほかのページでは右下に止まる。null なら全部のページで動く
    },
    analytics: {
      open: "chatbot_open",
      linkClick: "chatbot_link_click",
      contact: "chatbot_contact",
    },
    quickReplies: [],
    text: {
      title: "チャット",
      placeholder: "お困りごとを入力してください",
      openLabel: "チャットを開く",
      closeLabel: "閉じる",
      resetLabel: "最初に戻る",
      sendLabel: "送信",
      foot: "AIが自動で回答しています。\n内容が正しくない場合があります。",
      error: "通信がうまくいきませんでした。少し時間をおいてお試しください。",
      contactButton: "問い合わせる",
      cancelWords: ["やめる", "キャンセル", "中止"],
      askName: "お問い合わせを承ります。お名前を教えてください。（途中でやめるときは「やめる」と入力してください）",
      askEmail: "ありがとうございます。返信先のメールアドレスを教えてください。",
      askMessage: "ご相談の内容を教えてください。",
      badName: "お名前を50文字以内で入力してください。",
      badEmail: "メールアドレスの形が正しくないようです。もう一度入力してください。",
      badMessage: "ご相談の内容を2000文字以内で入力してください。",
      confirmLead: "この内容でお送りします。よろしければ「送信する」を押してください。",
      confirmLabels: { name: "お名前", email: "メールアドレス", message: "ご相談の内容" },
      confirmButtons: { send: "送信する", edit: "直す", cancel: "やめる" },
      useButtons: "下のボタンから「送信する」「直す」「やめる」をお選びください。",
      policy: "いただいた情報は、ご相談への返信のために使います。送信すると、プライバシーポリシーに同意したものとして扱います。",
      policyLinkText: "プライバシーポリシー",
      policyUrl: "",
      waitCheck: "確認の表示が終わるまで、少しお待ちください。終わったら、もう一度「送信する」を押してください。",
      sending: "送信しています…",
      sent: "送信しました。{email} に控えのメールをお送りしました。",
      sentNoCopy: "送信しました。お問い合わせは受け付けましたが、控えのメールをお送りできませんでした。お返事はお待ちください。",
      sentLog: "（お問い合わせを受け付けました）",
      cancelled: "お問い合わせを取りやめました。ほかに気になることがあれば、どうぞ。",
      badInput: "入力に誤りがありました。お手数ですが、もう一度最初からお願いします。",
      limit: "本日はこれ以上お受けできません。お手数ですが、お問い合わせフォームからご連絡ください。",
      badCheck: "確認がうまくいきませんでした。お手数ですが、もう一度お試しください。",
      noCheck: "ただいま送信の確認を準備できません。お手数ですが、お問い合わせフォームからご連絡ください。",
      sendError: "送信できませんでした。お手数ですが、お問い合わせフォームからご連絡ください。",
    },
  },
};

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof RegExp);

export function mergeDeep(base, over) {
  if (!isPlainObject(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = isPlainObject(v) && isPlainObject(base?.[k]) ? mergeDeep(base[k], v) : v;
  }
  return out;
}

// 設定に足りないものがあれば、その名前を並べて例外を投げる。サイトを作ったときに一度だけ通る
export function defineSite(site) {
  const s = mergeDeep(DEFAULTS, site);
  const missing = [];
  if (!s.name) missing.push("name");
  if (!Array.isArray(s.allowedOrigins) || !s.allowedOrigins.length) missing.push("allowedOrigins");
  if (!s.prompt?.system) missing.push("prompt.system");
  if (!s.contact?.url) missing.push("contact.url");
  if (!s.mail?.from) missing.push("mail.from");
  if (!s.mail?.owner) missing.push("mail.owner");
  if (typeof s.mail?.ownerMail !== "function") missing.push("mail.ownerMail");
  if (typeof s.mail?.replyMail !== "function") missing.push("mail.replyMail");
  if (!s.widget?.greeting) missing.push("widget.greeting");
  if (missing.length) throw new Error("site config: 次の値がありません: " + missing.join(", "));
  return Object.freeze(s);
}

// 画面（ブラウザ）へ渡してよい値だけを取り出す。秘密の値や関数・正規表現は渡さない
export function widgetConfig(site, env = {}) {
  const w = site.widget;
  return {
    storagePrefix: w.storagePrefix,
    theme: w.theme,
    font: w.font,
    images: w.images,
    layout: w.layout,
    analytics: w.analytics,
    quickReplies: w.quickReplies.map(({ label, contact, topic }) => ({ label, contact: !!contact, topic })),
    maxHistoryMessages: site.ai.maxHistoryMessages,
    maxMessageLength: site.ai.maxMessageLength,
    maxName: site.contact.maxName,
    maxMessage: site.contact.maxMessage,
    text: { ...w.text, greeting: w.greeting },
    turnstileSitekey: env.TURNSTILE_SITEKEY || "",
  };
}

export { DEFAULTS };
