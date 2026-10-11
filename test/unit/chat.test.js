import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleChat } from "../../src/chat.js";
import { json } from "../../src/http.js";
import { testSite } from "../helpers.js";

const site = testSite({ limits: { perIpPerDay: 2, sitePerDay: 3 } });
// テストごとに日付を変えて、1日の回数がほかのテストと混ざらないようにする
let day = 0;
let ip = 0;
const now = () => new Date(Date.UTC(2026, 0, 1, 3) + day * 86400000);
function chat(message, { e = {}, extra = {} } = {}) {
  const ctx = createExecutionContext();
  const req = new Request("https://w/chat", {
    method: "POST",
    headers: { "CF-Connecting-IP": `10.0.0.${ip}` },
    body: JSON.stringify({ message, conv: "c1", page: "https://shop.example/", ...extra }),
  });
  const res = handleChat(site, req, { ...env, ...e }, ctx, (b, s) => json(b, s), now());
  return res.then(async (r) => {
    await waitOnExecutionContext(ctx);
    return { status: r.status, body: await r.json() };
  });
}

const fakeAI = (response) => ({ run: vi.fn(async () => ({ response })) });

beforeEach(() => {
  day += 1;
  ip += 1;
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
});
afterEach(() => vi.restoreAllMocks());

describe("POST /chat", () => {
  it("AI の答えを後始末して返し、記録に残す", async () => {
    const AI = fakeAI("1ページ 10,000円（税込）です。[受付]");
    const r = await chat("ホームページの料金は？", { e: { AI } });
    expect(r.body).toEqual({ reply: "1ページ 10,000円（税込）です。", offerContact: false, unanswered: false });
    const call = AI.run.mock.calls[0][1];
    expect(call.messages[0].role).toBe("system");
    expect(call.max_tokens).toBe(400);
    const row = await env.LOG.prepare("SELECT * FROM messages WHERE question=?").bind("ホームページの料金は？").first();
    expect(row).toMatchObject({ conv: "c1", topic: "Webサイト制作のご相談", unanswered: 0, offer_contact: 0, limited: 0 });
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("記録には、質問と答えの中のメールアドレス・電話番号を伏せて入れる", async () => {
    const AI = fakeAI("taro@example.com・090-1234-5678 宛てにはお送りできません。");
    const r = await chat("山田です。taro@example.com か 090-1234-5678 に見積もりを", { e: { AI }, extra: { conv: "mask1" } });
    expect(r.body.reply).toBe("taro@example.com・090-1234-5678 宛てにはお送りできません。");
    const row = await env.LOG.prepare("SELECT * FROM messages WHERE conv=?").bind("mask1").first();
    expect(row.question).toBe("山田です。［メールアドレス］ か ［電話番号］ に見積もりを");
    expect(row.answer).toBe("［メールアドレス］・［電話番号］ 宛てにはお送りできません。");
  });

  it("持ち主の端末（owner）の会話は、答えるが記録しない", async () => {
    const AI = fakeAI("1ページ 10,000円（税込）です。");
    const r = await chat("持ち主の試しの質問", { e: { AI }, extra: { owner: true } });
    expect(r.body.reply).toBe("1ページ 10,000円（税込）です。");
    const row = await env.LOG.prepare("SELECT * FROM messages WHERE question=?").bind("持ち主の試しの質問").first();
    expect(row).toBeNull();
  });

  it("空・壊れた入力は 400", async () => {
    expect((await chat("   ")).status).toBe(400);
    const ctx = createExecutionContext();
    const res = await handleChat(site, new Request("https://w/", { method: "POST", body: "{" }), env, ctx, (b, s) => json(b, s), now());
    expect(res.status).toBe(400);
  });

  it("長すぎる質問は、AI を呼ばずに断る", async () => {
    const AI = fakeAI("x");
    const r = await chat("あ".repeat(501), { e: { AI } });
    expect(r.body.reply).toMatch(/500文字以内/);
    expect(AI.run).not.toHaveBeenCalled();
  });

  it("同じ IP の上限を超えたら、AI を呼ばずに受付だけ出す", async () => {
    const AI = fakeAI("答え");
    await chat("1", { e: { AI } });
    await chat("2", { e: { AI } });
    const r = await chat("3", { e: { AI } });
    expect(r.body).toEqual({ reply: site.messages.perIpLimit, offerContact: true, limited: true });
    expect(AI.run).toHaveBeenCalledTimes(2);
  });

  it("サイト全体の上限に達したら、AI を呼ばず、持ち主への知らせはその日1回だけ", async () => {
    const AI = fakeAI("答え");
    const mails = () => globalThis.fetch.mock.calls.filter(([u]) => String(u).includes("resend")).length;
    const e = { AI, RESEND_API_KEY: "k" };
    for (let i = 0; i < 3; i++) {
      ip += 1;
      await chat("q" + i, { e });
    }
    expect(mails()).toBe(1); // ちょうど上限に届いた回で知らせる
    ip += 1;
    const r = await chat("over", { e });
    expect(r.body.limited).toBe(true);
    expect(AI.run).toHaveBeenCalledTimes(3);
    expect(mails()).toBe(1); // 2回目は送らない
  });

  it("AI が失敗したら、問い合わせのフォームへ案内する", async () => {
    const AI = { run: vi.fn(async () => Promise.reject(new Error("quota"))) };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await chat("料金は？", { e: { AI } });
    expect(r.body.reply).toContain(site.contact.url);
    expect(r.body.offerContact).toBe(true);
  });

  it("AI が空の答えを返したら、失敗として扱う", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await chat("料金は？", { e: { AI: fakeAI("  ") } });
    expect(r.body.reply).toContain(site.contact.url);
  });

  it("手元の試験では、上限を TEST_SITE_LIMIT で差し替えられる（0 なら AI を呼ばない）", async () => {
    const AI = fakeAI("x");
    const r = await chat("q", { e: { AI, TEST_MODE: "1", TEST_SITE_LIMIT: "0" } });
    expect(r.body.limited).toBe(true);
    expect(AI.run).not.toHaveBeenCalled();
  });
});
