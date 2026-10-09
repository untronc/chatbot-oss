import { describe, expect, it } from "vitest";
import { defineSite, mergeDeep, widgetConfig } from "../../src/config.js";
import { testSite } from "../helpers.js";

describe("defineSite", () => {
  it("既定の値で埋める", () => {
    const s = testSite();
    expect(s.limits.perIpPerDay).toBe(20);
    expect(s.ai.maxTokens).toBe(400);
    expect(s.widget.text.title).toBe("チャット");
  });

  it("足りない値の名前を並べて止める", () => {
    expect(() => defineSite({ name: "x" })).toThrow(/allowedOrigins.*prompt\.system.*contact\.url.*mail\.from/);
  });

  it("設定は書き換えられない", () => {
    expect(Object.isFrozen(testSite())).toBe(true);
  });
});

describe("mergeDeep", () => {
  it("入れ子は混ぜ、配列と正規表現は置き換える", () => {
    const out = mergeDeep({ a: { b: 1, c: 2 }, list: [1, 2], re: /x/ }, { a: { c: 3 }, list: [9], re: /y/ });
    expect(out).toEqual({ a: { b: 1, c: 3 }, list: [9], re: /y/ });
  });
});

describe("widgetConfig", () => {
  it("画面へは文字と数だけを渡し、関数や正規表現は渡さない", () => {
    const w = widgetConfig(testSite(), { TURNSTILE_SITEKEY: "site-key" });
    expect(w.turnstileSitekey).toBe("site-key");
    expect(w.text.greeting).toBe("こんにちは");
    expect(w.quickReplies[1]).toEqual({ label: "相談したい", contact: true, topic: "チャットボットのご相談" });
    const json = JSON.stringify(w);
    expect(json).not.toContain("owner@shop.example");
    expect(json).not.toContain("テスト用の指示文");
  });
});
