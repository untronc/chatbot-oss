// 1日の回数の数え方（KV）。日付は UTC で区切る。Workers AI の無料枠と同じく、日本時間の9時に戻る。
// KV は書き込みの反映に少し時差があるので、同時に来たときは数回ぶん超えることがある（費用の上では誤差）。
// 数えられなくても会話は止めない（読めなければ0、書けなければ見送る）。

const TTL = 172800; // 2日で自動で消える。古い数の掃除は要らない

export const dayOf = (now = new Date()) => now.toISOString().slice(0, 10);

export async function readCount(kv, key) {
  try {
    return parseInt((await kv.get(key)) || "0", 10) || 0;
  } catch {
    return 0;
  }
}

export async function writeCount(kv, key, n) {
  try {
    await kv.put(key, String(n), { expirationTtl: TTL });
  } catch {
    // 数えられなくても止めない
  }
}

export const keys = {
  ip: (ip, now) => `${dayOf(now)}:${ip}`,
  site: (now) => `total:${dayOf(now)}`,
  siteNotified: (now) => `total-notified:${dayOf(now)}`,
  contact: (ip, now) => `contact:${dayOf(now)}:${ip}`,
};

// その日に1回だけ true を返す（上限の知らせを二重に送らないため）
export async function firstTimeToday(kv, key) {
  try {
    if (await kv.get(key)) return false;
    await kv.put(key, "1", { expirationTtl: TTL });
    return true;
  } catch {
    return false;
  }
}
