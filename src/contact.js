// POST /contact：会話の中での問い合わせの受付。AI は通さない。
// 流れ：入力の確認 → 同じ IP の件数 → Turnstile → メール2通（持ち主への知らせ → 送った人への控え）→ 記録
import { clientIp, readJson } from "./http.js";
import { keys, readCount, writeCount } from "./limits.js";
import { logContact } from "./log.js";
import { sendMail } from "./mail.js";
import { contactTopic } from "./topics.js";
import { verifyTurnstile } from "./turnstile.js";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 入力の確認。誤りのある項目の名前を返す（空なら誤りなし）
export function validateContact(site, { name, email, message }) {
  const errors = [];
  if (!name || name.length > site.contact.maxName) errors.push("name");
  if (!EMAIL_RE.test(email) || email.length > 254) errors.push("email");
  if (!message || message.length > site.contact.maxMessage) errors.push("message");
  return errors;
}

export function transcriptOf(site, history) {
  return (Array.isArray(history) ? history : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .slice(-site.contact.maxTranscript)
    .map((m) => ({ role: m.role, content: String(m.content ?? "").slice(0, 500) }));
}

export async function handleContact(site, request, env, respond, now = new Date()) {
  const body = await readJson(request);
  if (!body) return respond({ ok: false, error: "bad_request" }, 400);

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const message = String(body.message ?? "").trim();
  const errors = validateContact(site, { name, email, message });
  if (errors.length) return respond({ ok: false, error: "invalid", fields: errors }, 400);

  const ip = clientIp(request, env);
  const rateKey = keys.contact(ip, now);
  const used = await readCount(env.RATE, rateKey);
  if (used >= site.limits.contactsPerIpPerDay) return respond({ ok: false, error: "limit" }, 429);

  if (!(await verifyTurnstile(env.TURNSTILE_SECRET, String(body.turnstileToken ?? ""), ip))) {
    return respond({ ok: false, error: "turnstile" }, 403);
  }
  // ここまで通ったら1件と数える（送信に失敗しても数える。何度も叩かれるのを防ぐ）
  await writeCount(env.RATE, rateKey, used + 1);

  const transcript = transcriptOf(site, body.history);
  const words = transcript.map((m) => m.content).join("\n") + "\n" + message;
  const topic = contactTopic(site, words, body.button);
  const data = { name, email, message, topic, page: String(body.page ?? "").slice(0, 300), transcript, at: now.toISOString() };

  // 先に持ち主への知らせ。これが送れなければ受け付けていないので、失敗を返す（画面はフォームへ案内する）
  const owner = site.mail.ownerMail(data);
  try {
    await sendMail(site, env, { to: site.mail.owner, subject: owner.subject, text: owner.body, replyTo: owner.replyTo ?? email });
  } catch (err) {
    console.error("contact send error:", err?.message ?? err);
    return respond({ ok: false, error: "send" }, 502);
  }
  // 持ち主の端末からの受付は、メールは送るが記録（月ごとの数）には入れない
  if (!body.owner) await logContact(env, { conv: body.conv, topic }, now);

  // 控えが送れなくても、受付は済んでいる。失敗と返すと、送った人がもう一度送って知らせが二重になる
  const reply = site.mail.replyMail(data);
  let replySent = true;
  try {
    await sendMail(site, env, { to: email, subject: reply.subject, text: reply.body, replyTo: site.mail.replyTo ?? site.mail.owner });
  } catch (err) {
    console.error("contact reply error:", err?.message ?? err);
    replySent = false;
  }
  return respond({ ok: true, topic, replySent }, 200);
}
