// POST /chat：質問を受けて AI の答えを返す。
// 流れ：入力の確認 → 同じ IP の回数 → サイト全体の回数 → AI → 答えの後始末 → 記録（返事のあと）
import { clientIp, isTestMode, readJson } from "./http.js";
import { firstTimeToday, keys, readCount, writeCount } from "./limits.js";
import { logMessage } from "./log.js";
import { notifyOwner } from "./mail.js";
import { buildMessages, postProcessReply } from "./reply.js";

export async function handleChat(site, request, env, ctx, respond, now = new Date()) {
  const body = await readJson(request);
  if (!body) return respond({ error: "bad request" }, 400);

  const text = String(body.message ?? "").trim();
  if (!text) return respond({ error: "empty" }, 400);
  if (text.length > site.ai.maxMessageLength) return respond({ reply: site.messages.tooLong(site.ai.maxMessageLength) }, 200);

  // 答えを返すときは必ずここを通し、会話の記録にも残す。記録は返事のあとで書く
  // 持ち主の端末（画面が owner を付けてくる）の会話は、月ごとの数に入れないため記録しない
  const meta = { conv: body.conv, page: body.page, button: body.button, question: text };
  const done = (out) => {
    if (!body.owner) ctx.waitUntil(logMessage(site, env, { ...meta, answer: out.reply, ...out }, now));
    return respond(out, 200);
  };

  // 同じ IP からの回数。Origin は偽装できるので、URL を直接叩かれたときの歯止めはこちら
  const ipKey = keys.ip(clientIp(request, env), now);
  const ipUsed = await readCount(env.RATE, ipKey);
  if (!isTestMode(env) && ipUsed >= site.limits.perIpPerDay) {
    // 受付は AI を通さないので使える
    return done({ reply: site.messages.perIpLimit, offerContact: true, limited: true });
  }

  // サイト全体の回数。手元の試験では TEST_SITE_LIMIT で上限を差し替えられる（0 にすれば AI を呼ばずに上限の動きを確かめられる）
  const siteLimit =
    isTestMode(env) && env.TEST_SITE_LIMIT !== undefined ? Number(env.TEST_SITE_LIMIT) : site.limits.sitePerDay;
  const siteKey = keys.site(now);
  const siteUsed = await readCount(env.RATE, siteKey);
  const notifyLimit = async () => {
    if (await firstTimeToday(env.RATE, keys.siteNotified(now))) {
      await notifyOwner(site, env, site.mail.limitMail ? site.mail.limitMail(siteLimit, now) : defaultLimitMail(site, siteLimit, now));
    }
  };
  if (siteUsed >= siteLimit) {
    ctx.waitUntil(notifyLimit());
    return done({ reply: site.messages.siteLimit, offerContact: true, limited: true });
  }

  // AI を呼ぶ前に数える。呼び出し自体が枠を使うので、失敗しても1回と数える
  await writeCount(env.RATE, siteKey, siteUsed + 1);
  if (siteUsed + 1 === siteLimit) ctx.waitUntil(notifyLimit()); // ちょうど上限に届いた回でも知らせる
  await writeCount(env.RATE, ipKey, ipUsed + 1);

  try {
    const result = await env.AI.run(site.ai.model, {
      messages: buildMessages(site, body.history, text),
      max_tokens: site.ai.maxTokens,
    });
    const raw = String(result?.response ?? "").trim();
    if (!raw) throw new Error("empty response");
    return done(postProcessReply(site, text, raw));
  } catch (err) {
    // 枠切れ・モデル側の障害。黙らせず、問い合わせへ流す（受付は AI を通さないので動く）
    console.error("AI error:", err?.message ?? err);
    return done({ reply: site.messages.aiError(site.contact.url), offerContact: true });
  }
}

export function defaultLimitMail(site, limit, now = new Date()) {
  const at = now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  return {
    subject: `${site.name} チャットボット：本日のAIの上限（${limit}回）に達しました`,
    body: [
      `${site.name} のチャットボットが、サイト全体の1日の上限（${limit}回）に達しました（${at}）。`,
      "",
      "・上限のあいだは、AIを呼ばずに決まった文で答え、問い合わせの受付だけを出しています",
      "・上限は日本時間の朝9時に戻ります",
      "",
      "この知らせは、上限に達した日に1回だけ送ります。",
    ].join("\n"),
  };
}
