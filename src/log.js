// 会話の記録（D1。binding: LOG）。受付で入力された名前・メールアドレス・相談の中身は入れない。表の形は migrations/。
// 記録に失敗しても、会話や受付は止めない。
import { topicOf } from "./topics.js";

const cut = (v, n) => String(v ?? "").slice(0, n);

// 会話の欄に書かれたメールアドレス・電話番号は、記録に入れる前に伏せる。名前は見分けられないので伏せない
const EMAIL = /[A-Za-z0-9._%+-]+[@＠][A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const D = "[0-9０-９]";
const S = "[-‐－―−ー 　()（）]?";
// 0 から始まる10〜11桁と、+81 から始まるもの。前後に数字が続くもの（金額・日付）は伏せない
const PHONE = new RegExp(`(?<![0-9０-９])(?:[+＋][8８][1１]${S}|[0０])(?:${D}${S}){8,9}${D}(?![0-9０-９])`, "g");

export const maskPersonal = (v) =>
  String(v ?? "").replace(EMAIL, "［メールアドレス］").replace(PHONE, "［電話番号］");

export async function logMessage(site, env, r, now = new Date()) {
  if (!env.LOG) return;
  try {
    await env.LOG.prepare(
      "INSERT INTO messages (id, at, conv, page, button, question, answer, topic, unanswered, offer_contact, limited) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
    )
      .bind(
        crypto.randomUUID(),
        now.toISOString(),
        cut(r.conv, 40),
        cut(r.page, 300),
        cut(r.button, 60),
        cut(maskPersonal(r.question), 500),
        cut(maskPersonal(r.answer), 2000),
        topicOf(site, String(r.question ?? "")),
        r.unanswered ? 1 : 0,
        r.offerContact ? 1 : 0,
        r.limited ? 1 : 0
      )
      .run();
  } catch (err) {
    console.error("log error:", err?.message ?? err);
  }
}

export async function logContact(env, r, now = new Date()) {
  if (!env.LOG) return;
  try {
    await env.LOG.prepare("INSERT INTO contacts (id, at, conv, topic) VALUES (?,?,?,?)")
      .bind(crypto.randomUUID(), now.toISOString(), cut(r.conv, 40), cut(r.topic, 100))
      .run();
  } catch (err) {
    console.error("log error:", err?.message ?? err);
  }
}
