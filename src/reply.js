// AI の答えの後始末。AI の出力をそのまま信じず、画面に出す前にここで決まりに合わせる。

export function buildMessages(site, history, text) {
  const max = site.ai.maxMessageLength;
  const recent = (Array.isArray(history) ? history : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .slice(-site.ai.maxHistoryMessages)
    .map((m) => ({ role: m.role, content: String(m.content ?? "").slice(0, max) }));
  return [{ role: "system", content: site.prompt.system }, ...recent, { role: "user", content: text }];
}

// 返す値：{ reply, offerContact, unanswered }
// - offerContact：画面に「問い合わせる」ボタンを出すか。AI の付けた印ではなく、ここで決める（AI は説明だけの答えにも印を付けるため）
// - unanswered：答えられなかったか。決まった文が出たかで数える
export function postProcessReply(site, text, raw) {
  const { unansweredPhrase, contactTag, leakMarkers } = site.prompt;
  let reply = String(raw ?? "").split(contactTag).join("").trim();

  // 指示文が漏れたら、決まった文に差し替える
  const leaked = leakMarkers.some((m) => reply.includes(m));
  if (leaked) reply = unansweredPhrase;

  // 相談の申し出を「お答えできません」で返したら、受付の案内に差し替える。料金ページの無いサービスなら「対応しています」を先に添える
  const wantsContact = !leaked && site.contact.intent.test(text);
  if (wantsContact && reply.startsWith(unansweredPhrase)) {
    const listed = site.contact.listedOnly.find((s) => s.re.test(text));
    reply = (listed ? listed.reply : "") + site.contact.reply;
  }

  const unanswered = reply.includes(unansweredPhrase);
  // 答えの中で問い合わせを勧めたときにもボタンを出す
  const offerContact = wantsContact || (!leaked && (unanswered || /お問い合わせ|ご相談ください/.test(reply)));
  return { reply, offerContact, unanswered };
}
