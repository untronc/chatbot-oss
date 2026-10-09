import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMonthlyMail, deleteExpired, monthlyReport, monthRange, previousMonths, unknownYen } from "../../src/report.js";
import { testSite } from "../helpers.js";

const site = testSite();
afterEach(() => vi.restoreAllMocks());

describe("暦（日本時間）", () => {
  it("先月とその前の月。1月なら前の年の12月", () => {
    expect(previousMonths(new Date("2026-11-01T00:00:00Z"))).toEqual({ cur: { year: 2026, month: 10 }, prev: { year: 2026, month: 9 } });
    expect(previousMonths(new Date("2027-01-01T00:00:00Z"))).toEqual({ cur: { year: 2026, month: 12 }, prev: { year: 2026, month: 11 } });
    expect(previousMonths(new Date("2027-02-01T00:00:00Z"))).toEqual({ cur: { year: 2027, month: 1 }, prev: { year: 2026, month: 12 } });
  });

  it("UTC では前の日の15時に始まる", () => {
    expect(monthRange(2026, 10)).toEqual({ from: "2026-09-30T15:00:00.000Z", to: "2026-10-31T15:00:00.000Z" });
  });
});

describe("unknownYen", () => {
  it("ページに載っていない金額だけを拾う", () => {
    expect(unknownYen(site.allowedYen, "10,000円と 99,800 円と 50,000円")).toEqual(["99,800"]);
    expect(unknownYen(site.allowedYen, "金額なし")).toEqual([]);
  });
});

const empty = { people: 0, turns: 0, unanswered: 0, contacts: 0, limitedDays: 0, topics: [], buttons: [], unansweredList: [], yenAnswers: [], contactList: [] };

describe("buildMonthlyMail", () => {
  it("5項目と先月比", () => {
    const s = {
      ...empty,
      people: 3,
      turns: 7,
      unanswered: 1,
      contacts: 1,
      topics: [{ topic: "Webサイト制作のご相談", n: 4 }],
      buttons: [{ button: "料金", n: 2 }],
      unansweredList: [{ at: "2026-10-03T01:00:00Z", question: "天気は？" }],
      yenAnswers: [{ at: "2026-10-04T01:00:00Z", question: "10ページは？", answer: "290,000円です" }],
      contactList: [{ at: "2026-10-05T01:00:00Z", topic: "Webサイト制作のご相談" }],
    };
    const m = buildMonthlyMail(site, { year: 2026, month: 10 }, s, { ...empty, people: 1, turns: 7, contacts: 2 });
    expect(m.subject).toBe("テスト商店 チャットボット 月次レポート（2026年10月）");
    expect(m.body).toContain("会話した人：3人（+2）／受け答え：7回（±0）／問い合わせの受付：1件（-1）");
    expect(m.body).toContain("サービス別：Webサイト制作のご相談 4件");
    expect(m.body).toContain("「天気は？」（10/3）");
    expect(m.body).toContain("10/4「10ページは？」→ 290,000円");
    expect(m.body).toContain("10/5 Webサイト制作のご相談");
    expect(m.body).toContain("会話の記録は365日で自動で消しています。");
  });

  it("何も無い月は「なし」", () => {
    const m = buildMonthlyMail(site, { year: 2026, month: 10 }, empty, empty);
    expect(m.body.match(/・なし/g)).toHaveLength(3);
  });
});

describe("monthlyReport", () => {
  it("先月の分を集計して持ち主に送り、保存期間を過ぎた記録を消す", async () => {
    const ins = (at, q, a, topic, unanswered = 0) =>
      env.LOG.prepare(
        "INSERT INTO messages (id, at, conv, page, button, question, answer, topic, unanswered, offer_contact, limited) VALUES (?,?,?,?,?,?,?,?,?,0,0)"
      )
        .bind(crypto.randomUUID(), at, "c-" + q, "", "", q, a, topic, unanswered)
        .run();
    await ins("2026-10-10T00:00:00Z", "集計Q1", "10,000円です", "Webサイト制作のご相談");
    await ins("2026-10-11T00:00:00Z", "集計Q2", site.prompt.unansweredPhrase, "その他のご相談", 1);
    await ins("2025-09-01T00:00:00Z", "古いQ", "x", "その他のご相談");

    const sent = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_u, init) => {
      sent.push(JSON.parse(init.body));
      return new Response("{}");
    });
    const mail = await monthlyReport(site, { ...env, RESEND_API_KEY: "k" }, new Date("2026-11-01T00:00:00Z"));
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["owner@shop.example"]);
    expect(mail.body).toContain("「集計Q2」");
    expect(await env.LOG.prepare("SELECT COUNT(*) AS n FROM messages WHERE question='古いQ'").first()).toEqual({ n: 0 });
    expect(await env.LOG.prepare("SELECT COUNT(*) AS n FROM messages WHERE question='集計Q1'").first()).toEqual({ n: 1 });
  });

  it("D1 が無ければ何もしない", async () => {
    expect(await monthlyReport(site, {})).toBeNull();
  });

  it("消すのに失敗しても止まらない", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const db = { prepare: () => ({ bind: () => ({ run: () => Promise.reject(new Error("x")) }) }) };
    await expect(deleteExpired(site, db)).resolves.toBeUndefined();
  });
});
