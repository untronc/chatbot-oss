// どのサービスの話か。AI を使わず、言葉で当てる。上から順に見て、最初に当たったもの。
// 会話の記録（月ごとの集計）と、問い合わせの件名の両方で使う。

export function topicOf(site, text) {
  return site.contact.topics.find((t) => t.re.test(text))?.label ?? site.contact.fallbackTopic;
}

// 問い合わせの件名。会話の言葉で決まらないときは、受付を始めたボタンの件名を使う（ボタンから始めると会話が無いため）
export function contactTopic(site, words, button) {
  const fromWords = site.contact.topics.find((t) => t.re.test(words))?.label;
  if (fromWords) return fromWords;
  const fromButton = site.widget.quickReplies.find((q) => q.contact && q.topic && q.label === button)?.topic;
  return fromButton ?? site.contact.fallbackTopic;
}
