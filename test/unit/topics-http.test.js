import { describe, expect, it } from "vitest";
import { allowedOrigins, clientIp, corsHeaders, isAllowedOrigin, TEST_ORIGIN } from "../../src/http.js";
import { dayOf, keys } from "../../src/limits.js";
import { contactTopic, topicOf } from "../../src/topics.js";
import { testSite } from "../helpers.js";

const site = testSite();

describe("topicOf / contactTopic", () => {
  it("上から順に、最初に当たった件名", () => {
    expect(topicOf(site, "ホームページにチャットボットを")).toBe("Webサイト制作のご相談");
    expect(topicOf(site, "こんにちは")).toBe("その他のご相談");
  });

  it("問い合わせの件名：会話の言葉 → 受付を始めたボタン → その他", () => {
    expect(contactTopic(site, "サイトを作りたい", "相談したい")).toBe("Webサイト制作のご相談");
    expect(contactTopic(site, "自社に導入を検討", "相談したい")).toBe("チャットボットのご相談");
    expect(contactTopic(site, "自社に導入を検討", "料金")).toBe("その他のご相談");
    expect(contactTopic(site, "自社に導入を検討", undefined)).toBe("その他のご相談");
  });
});

describe("呼び出し元の確かめ", () => {
  it("本番では、設定したドメインだけ", () => {
    expect(isAllowedOrigin(site, {}, "https://shop.example")).toBe(true);
    expect(isAllowedOrigin(site, {}, TEST_ORIGIN)).toBe(false);
    expect(isAllowedOrigin(site, {}, "https://evil.example")).toBe(false);
  });

  it("手元の試験のときだけ、試験用のページも受け付ける", () => {
    expect(allowedOrigins(site, { TEST_MODE: "1" })).toContain(TEST_ORIGIN);
  });

  it("許可していない呼び出し元には、自分のドメインを返す", () => {
    expect(corsHeaders(site, {}, "https://evil.example")["Access-Control-Allow-Origin"]).toBe("https://shop.example");
    expect(corsHeaders(site, {}, "https://shop.example")["Access-Control-Allow-Origin"]).toBe("https://shop.example");
  });

  it("X-Test-IP は手元の試験のときだけ効く", () => {
    const req = new Request("https://w/", { headers: { "CF-Connecting-IP": "1.1.1.1", "X-Test-IP": "t" } });
    expect(clientIp(req, {})).toBe("1.1.1.1");
    expect(clientIp(req, { TEST_MODE: "1" })).toBe("t");
  });
});

describe("回数の鍵", () => {
  it("UTC の日付で区切る（日本時間の9時に変わる）", () => {
    expect(dayOf(new Date("2026-10-05T23:59:59Z"))).toBe("2026-10-05");
    expect(keys.site(new Date("2026-10-06T00:00:00Z"))).toBe("total:2026-10-06");
    expect(keys.contact("ip", new Date("2026-10-06T00:00:00Z"))).toBe("contact:2026-10-06:ip");
  });
});
