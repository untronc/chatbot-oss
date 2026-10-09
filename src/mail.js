// メールの送信（Resend の API。https://resend.com/docs/api-reference/emails/send-email）。
// 鍵は Cloudflare の秘密の設定 RESEND_API_KEY に入れる。ファイルに書かない。
import { isTestMode } from "./http.js";

const RESEND_URL = "https://api.resend.com/emails";

// 1通送る。失敗したら例外を投げる。
// 手元の試験のときだけ、RESEND_API_URL で送り先を手元の受け口に差し替えられる
export async function sendMail(site, env, { to, subject, text, replyTo }) {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY がありません");
  const url = (isTestMode(env) && env.RESEND_API_URL) || RESEND_URL;
  const mail = { from: site.mail.from, to: [to], subject: String(subject).slice(0, 200), text: String(text).slice(0, 20000) };
  if (replyTo) mail.reply_to = String(replyTo).slice(0, 254);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.RESEND_API_KEY },
    body: JSON.stringify(mail),
  });
  if (!res.ok) {
    const out = await res.text().catch(() => "");
    throw new Error(`resend ${res.status} ${out.slice(0, 200)}`);
  }
}

// サイトの持ち主へ1通（上限の知らせ・月ごとの集計）。失敗しても例外にしない
export async function notifyOwner(site, env, mail) {
  try {
    await sendMail(site, env, { to: site.mail.owner, subject: mail.subject, text: mail.body, replyTo: mail.replyTo });
    return true;
  } catch (err) {
    console.error("notify error:", err?.message ?? err);
    return false;
  }
}
