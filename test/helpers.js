// テストで使う、最小のサイトの設定
import { defineSite } from "../src/config.js";

export function testSite(over = {}) {
  return defineSite({
    name: "テスト商店",
    allowedOrigins: ["https://shop.example"],
    prompt: { system: "テスト用の指示文", leakMarkers: ["# 守ること"] },
    contact: {
      url: "https://shop.example/contact/",
      topics: [
        { label: "Webサイト制作のご相談", re: /ホームページ|サイト/ },
        { label: "チャットボットのご相談", re: /チャットボット/ },
      ],
      listedOnly: [{ re: /保守/, reply: "保守にも対応しています。" }],
    },
    allowedYen: ["10,000", "50,000"],
    mail: {
      from: "Shop <info@shop.example>",
      owner: "owner@shop.example",
      replyTo: "owner@shop.example",
      ownerMail: (d) => ({ subject: `知らせ（${d.topic}）`, body: `${d.name}\n${d.message}`, replyTo: d.email }),
      replyMail: (d) => ({ subject: "控え", body: d.message }),
    },
    widget: {
      greeting: "こんにちは",
      quickReplies: [{ label: "料金" }, { label: "相談したい", contact: true, topic: "チャットボットのご相談" }],
    },
    ...over,
  });
}
