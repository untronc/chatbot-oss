// 月ごとの集計（毎月1日 0:00 UTC＝日本時間9時の定期実行）。先月（日本時間の暦）の分を持ち主にメールで送り、保存期間を過ぎた記録を消す。
import { notifyOwner } from "./mail.js";

const JST = 9 * 60 * 60 * 1000;

// now から見た「先月」と「その前の月」（日本時間の暦）
export function previousMonths(now = new Date()) {
  const j = new Date(now.getTime() + JST);
  let year = j.getUTCFullYear();
  let month = j.getUTCMonth(); // 0〜11 の今月＝1〜12 の先月。0 なら前年の12月
  if (month === 0) {
    month = 12;
    year -= 1;
  }
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  return { cur: { year, month }, prev };
}

// 日本時間の暦で、その月の始まりと終わり（UTC の ISO 文字列。終わりは含まない）
export function monthRange(year, month) {
  return {
    from: new Date(Date.UTC(year, month - 1, 1) - JST).toISOString(),
    to: new Date(Date.UTC(year, month, 1) - JST).toISOString(),
  };
}

export async function stats(db, from, to) {
  const one = (sql) => db.prepare(sql).bind(from, to).first();
  const all = (sql) => db.prepare(sql).bind(from, to).all().then((x) => x.results || []);
  const m = await one(
    "SELECT COUNT(DISTINCT conv) AS people, SUM(CASE WHEN limited=0 THEN 1 ELSE 0 END) AS turns, SUM(unanswered) AS unanswered FROM messages WHERE at>=? AND at<?"
  );
  const c = await one("SELECT COUNT(*) AS n FROM contacts WHERE at>=? AND at<?");
  const ld = await one("SELECT COUNT(DISTINCT substr(at,1,10)) AS n FROM messages WHERE limited=1 AND at>=? AND at<?");
  return {
    people: m?.people || 0,
    turns: m?.turns || 0,
    unanswered: m?.unanswered || 0,
    contacts: c?.n || 0,
    limitedDays: ld?.n || 0,
    topics: await all("SELECT topic, COUNT(*) AS n FROM messages WHERE limited=0 AND at>=? AND at<? GROUP BY topic ORDER BY n DESC, topic"),
    buttons: await all("SELECT button, COUNT(*) AS n FROM messages WHERE button<>'' AND at>=? AND at<? GROUP BY button ORDER BY n DESC, button"),
    unansweredList: await all("SELECT at, question FROM messages WHERE unanswered=1 AND at>=? AND at<? ORDER BY at"),
    yenAnswers: await all("SELECT at, question, answer FROM messages WHERE answer LIKE '%円%' AND at>=? AND at<? ORDER BY at"),
    contactList: await all("SELECT at, topic FROM contacts WHERE at>=? AND at<? ORDER BY at"),
  };
}

// 答えの中の「○○円」のうち、ページに載っている金額の一覧に無いもの
export function unknownYen(allowedYen, answer) {
  return [...String(answer).matchAll(/([\d,]{3,})\s*円/g)].map((m) => m[1]).filter((y) => !allowedYen.includes(y));
}

const jstDay = (iso) => {
  const d = new Date(new Date(iso).getTime() + JST);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};
const diff = (a, b) => {
  const d = a - b;
  return d === 0 ? "±0" : d > 0 ? `+${d}` : `${d}`;
};

export function buildMonthlyMail(site, { year, month }, s, p) {
  const suspects = s.yenAnswers.map((r) => ({ r, bad: unknownYen(site.allowedYen, r.answer) })).filter((x) => x.bad.length);
  const none = ["   ・なし"];
  const lines = [
    `${site.name} のチャットボットの、${year}年${month}月（日本時間）の集計です。`,
    "",
    "1. 数字（かっこ内は先月比）",
    `   会話した人：${s.people}人（${diff(s.people, p.people)}）／受け答え：${s.turns}回（${diff(s.turns, p.turns)}）／問い合わせの受付：${s.contacts}件（${diff(s.contacts, p.contacts)}）`,
    `   答えられなかった回数：${s.unanswered}回／上限に達した日：${s.limitedDays}日`,
    "   ※「会話した人」はブラウザのタブごとに数えています。同じ人が別の日に来ると2人と数えます",
    "",
    "2. よく聞かれたこと",
    "   サービス別：" + (s.topics.length ? s.topics.map((t) => `${t.topic} ${t.n}件`).join("・") : "なし"),
    "   ボタン別：" + (s.buttons.length ? s.buttons.map((b) => `${b.button} ${b.n}回`).join("・") : "なし"),
    "",
    "3. 答えられなかった質問（全文）… 指示文に足すかを判断する材料",
    ...(s.unansweredList.length ? s.unansweredList.map((u) => `   ・「${u.question}」（${jstDay(u.at)}）`) : none),
    "",
    "4. ページと違う金額を答えた疑い（答えの金額を、ページに載っている金額と自動で照らし合わせた結果）",
    ...(suspects.length ? suspects.map((x) => `   ・${jstDay(x.r.at)}「${x.r.question}」→ ${x.bad.join("・")}円\n     答え：${x.r.answer}`) : none),
    "",
    "5. 受け付けた問い合わせ（名前・連絡先は載せていません。中身は受付のときの知らせのメールをご覧ください）",
    ...(s.contactList.length ? s.contactList.map((c) => `   ・${jstDay(c.at)} ${c.topic}`) : none),
    "",
    `会話の記録は${site.retentionDays}日で自動で消しています。`,
  ];
  return { subject: `${site.name} チャットボット 月次レポート（${year}年${month}月）`, body: lines.join("\n") };
}

export async function deleteExpired(site, db, now = new Date()) {
  const cutoff = new Date(now.getTime() - site.retentionDays * 24 * 60 * 60 * 1000).toISOString();
  try {
    await db.prepare("DELETE FROM messages WHERE at < ?").bind(cutoff).run();
    await db.prepare("DELETE FROM contacts WHERE at < ?").bind(cutoff).run();
  } catch (err) {
    console.error("cleanup error:", err?.message ?? err);
  }
}

export async function monthlyReport(site, env, now = new Date()) {
  if (!env.LOG) return null;
  const { cur, prev } = previousMonths(now);
  const c = monthRange(cur.year, cur.month);
  const p = monthRange(prev.year, prev.month);
  const mail = buildMonthlyMail(site, cur, await stats(env.LOG, c.from, c.to), await stats(env.LOG, p.from, p.to));
  await notifyOwner(site, env, mail);
  await deleteExpired(site, env.LOG, now);
  return mail;
}
