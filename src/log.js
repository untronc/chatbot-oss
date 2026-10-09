// 会話の記録（D1。binding: LOG）。名前・メールアドレス・相談の中身は入れない。表の形は migrations/。
// 記録に失敗しても、会話や受付は止めない。
import { topicOf } from "./topics.js";

const cut = (v, n) => String(v ?? "").slice(0, n);

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
        cut(r.question, 500),
        cut(r.answer, 2000),
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
