// 受付とメールの試験（サイトの設定を読んで、期待する値を決める）。AI は呼ばず、メールも本物は送らない。
// Resend の代わりに手元の受け口（127.0.0.1:8790）を立てて、Worker が Resend に渡す中身を確かめる。
// 使い方（chatbot-oss フォルダで）：
//   npm run dev:contacttest -- -c sites/<名前>/wrangler.jsonc   … 手元で Worker を起動（別の窓で）
//   npm run test:contact -- <名前>
// ・TEST_SITE_LIMIT:0 … サイト全体の上限を0にして、AI を呼ばずに「上限の知らせ」を出させる
// ・--test-scheduled … /__scheduled で月ごとの集計（手元の D1）を動かす
// .dev.vars の TURNSTILE_SECRET は Cloudflare 公式の「必ず通る」試験用の鍵。対になる試験用の札は XXXX.DUMMY.TOKEN.XXXX
// .dev.vars の RESEND_API_URL・RESEND_API_KEY は手元の受け口と試験用の合言葉（本物の鍵ではない）

import http from "node:http";
import { contactTopic } from "../../src/topics.js";

const siteName = process.argv[2];
if (!siteName) {
  console.error("使い方: node test/e2e/run-contact-test.mjs <サイトの名前>");
  process.exit(2);
}
const site = (await import(`../../sites/${siteName}/site.config.js`)).default;

const BASE = process.env.BASE || "http://localhost:8789";
const ORIGIN = "http://localhost:8788";
const TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
const run = Date.now().toString(36); // 回数制限の記録が前回の試験と混ざらないよう、IP に付ける
const FROM = site.mail.from;
const OWNER = site.mail.owner;
const REPLY_TO = site.mail.replyTo ?? OWNER;

// Resend の代わり。本物と同じく、成功なら 200 と id、失敗なら 4xx を返す
const received = [];
const stub = http.createServer((req, res) => {
  let s = "";
  req.on("data", (c) => (s += c));
  req.on("end", () => {
    const d = JSON.parse(s || "{}");
    received.push({ path: req.url, auth: req.headers.authorization, ...d });
    const ok =
      req.url === "/emails" &&
      req.headers.authorization === "Bearer local-test-only" &&
      d.from && d.to && d.subject && d.text &&
      !String(d.text).includes("FAILTEST") &&
      !(d.to || []).includes("replyfail@example.com"); // 控えだけ失敗させる宛先
    res.writeHead(ok ? 200 : 422, { "Content-Type": "application/json" });
    res.end(JSON.stringify(ok ? { id: "stub-" + received.length } : { statusCode: 422, message: "stub" }));
  });
});
await new Promise((r) => stub.listen(8790, "127.0.0.1", r));

async function post(path, body, { ip = "a", origin = ORIGIN } = {}) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, "X-Test-IP": `${run}-${ip}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const good = {
  name: "試験 太郎",
  email: "test@example.com",
  message: "問い合わせの試験です。",
  turnstileToken: TOKEN,
  page: site.allowedOrigins[0] + "/",
  history: [
    { role: "user", content: "料金について知りたい" },
    { role: "assistant", content: "料金のご案内です。" },
  ],
};
const goodWords = good.history.map((m) => m.content).join("\n") + "\n" + good.message;
const goodTopic = contactTopic(site, goodWords, "");
const replySubject = site.mail.replyMail({ ...good, topic: goodTopic, transcript: [], at: "" }).subject;

const results = [];
const check = (name, cond, detail = "") => {
  results.push({ name, ok: !!cond, detail });
  process.stdout.write(cond ? "." : "x");
};

// 1. 正しい送信 → 受け付け、Resend に2通（持ち主への知らせ → 送った人への控え）
let n = received.length;
let r = await post("/contact", good, { ip: "ok" });
const [owner, reply] = received.slice(n);
check("正しい送信は受け付ける", r.status === 200 && r.body.ok, JSON.stringify(r.body));
check("件名は会話の言葉から決まる", r.body.topic === goodTopic, `${r.body.topic}（期待：${goodTopic}）`);
check("Resend に2通渡る", received.length - n === 2, `${received.length - n}通`);
check("鍵は Authorization に付く", owner?.auth === "Bearer local-test-only");
check("差出人は設定の from", owner?.from === FROM && reply?.from === FROM, `${owner?.from} / ${reply?.from}`);
check("通知の宛先は持ち主", JSON.stringify(owner?.to) === JSON.stringify([OWNER]), JSON.stringify(owner?.to));
check("通知の返信先は送った人", owner?.reply_to === "test@example.com", owner?.reply_to);
check("通知に会話が付く", String(owner?.text).includes("料金について知りたい"));
check("控えの宛先は送った人", JSON.stringify(reply?.to) === JSON.stringify(["test@example.com"]), JSON.stringify(reply?.to));
check("控えの返信先は設定の replyTo", reply?.reply_to === REPLY_TO, reply?.reply_to);
check("控えの件名は設定どおり", reply?.subject === replySubject, reply?.subject);

// 1b. 受付のボタンから始めた（会話なし）→ 会話の言葉で決まらなければ、ボタンの件名
const plain = "問い合わせの試験です。";
const contactBtn = site.widget.quickReplies.find((q) => q.contact && q.topic);
if (contactBtn) {
  r = await post("/contact", { ...good, message: plain, history: [], button: contactBtn.label }, { ip: "btn" });
  const want = contactTopic(site, plain, contactBtn.label);
  check("ボタンから始めた受付の件名", r.body.topic === want, `${r.body.topic}（期待：${want}）`);
}
r = await post("/contact", { ...good, message: plain, history: [] }, { ip: "btn2" });
check("ボタンが無ければ会話の言葉か fallbackTopic", r.body.topic === contactTopic(site, plain, ""), r.body.topic);

// 2. 入力の誤り
r = await post("/contact", { ...good, email: "test@example" }, { ip: "e1" });
check("メールアドレスの形が違うと断る", r.status === 400 && r.body.fields?.includes("email"), JSON.stringify(r.body));
r = await post("/contact", { ...good, name: "  " }, { ip: "e2" });
check("名前が空だと断る", r.status === 400 && r.body.fields?.includes("name"), JSON.stringify(r.body));
r = await post("/contact", { ...good, message: "あ".repeat(2001) }, { ip: "e3" });
check("相談の中身が長すぎると断る", r.status === 400 && r.body.fields?.includes("message"), JSON.stringify(r.body));

// 3. Turnstile の札が無い
r = await post("/contact", { ...good, turnstileToken: "" }, { ip: "t1" });
check("Turnstile の札が無いと断る", r.status === 403 && r.body.error === "turnstile", JSON.stringify(r.body));

// 4. 許可していないサイトから
r = await post("/contact", good, { ip: "o1", origin: "https://evil.example" });
check("ほかのサイトからは断る", r.status === 403, JSON.stringify(r.body));

// 5. 回数制限（1日3件まで）
n = received.length;
for (let i = 0; i < 3; i++) await post("/contact", good, { ip: "lim" });
r = await post("/contact", good, { ip: "lim" });
check("同じIPの4件目は断る", r.status === 429 && r.body.error === "limit", JSON.stringify(r.body));
check("断った4件目は Resend に渡らない", received.length - n === 6, `${received.length - n}通（3件×2通なら6）`);

// 6. Resend が失敗を返したとき（通知が失敗したら、控えは送らない）
n = received.length;
r = await post("/contact", { ...good, message: "FAILTEST" }, { ip: "f1" });
check("送信に失敗したら失敗を返す", r.status === 502 && r.body.error === "send", JSON.stringify(r.body));
check("通知が失敗したら控えは送らない", received.length - n === 1, `${received.length - n}通`);

// 6b. 控えだけ失敗したとき：受付は済んでいるので ok（失敗と返すと、送った人がもう一度送って知らせが二重になる）
n = received.length;
r = await post("/contact", { ...good, email: "replyfail@example.com" }, { ip: "f2" });
check("控えだけ失敗しても受付は ok", r.status === 200 && r.body.ok === true && r.body.replySent === false, JSON.stringify(r.body));
check("知らせと控えを1通ずつ試した", received.length - n === 2, `${received.length - n}通`);

// 7. サイト全体の上限の知らせ（TEST_SITE_LIMIT:0 で起動。AI は呼ばない）
n = received.length;
r = await post("/chat", { message: "こんにちは", conv: "test-" + run }, { ip: "tl" });
check("上限の日は AI を呼ばずに決まった文", r.status === 200 && r.body.limited === true, JSON.stringify(r.body).slice(0, 120));
await wait(1500); // 知らせは返事のあとで送る
const limitMails = received.slice(n);
check(
  "上限の知らせが持ち主に1通（その日2回目以降は送らない）",
  limitMails.length <= 1 && (limitMails.length === 0 || (JSON.stringify(limitMails[0].to) === JSON.stringify([OWNER]) && limitMails[0].subject.includes("上限"))),
  `${limitMails.length}通 ${limitMails[0]?.subject ?? "（今日すでに送った記録があれば0通）"}`
);

// 8. 月ごとの集計のメール（手元の D1 から）
n = received.length;
const sch = await fetch(BASE + "/__scheduled?cron=" + encodeURIComponent("0 0 1 * *"));
await wait(1500);
const monthly = received.slice(n)[0];
check("月ごとの集計を動かせる", sch.ok, String(sch.status));
check("集計のメールが持ち主に届く形", JSON.stringify(monthly?.to) === JSON.stringify([OWNER]) && monthly?.from === FROM, `${monthly?.subject}`);

stub.close();
const pass = results.filter((x) => x.ok).length;
console.log(`\n合格 ${pass}/${results.length}`);
for (const x of results.filter((x) => !x.ok)) console.log(`  不合格：${x.name}  ${x.detail}`);
for (const x of results.filter((x) => x.ok && x.detail && /通/.test(x.detail))) console.log(`  （${x.name}：${x.detail}）`);
