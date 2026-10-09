import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleContact, transcriptOf, validateContact } from "../../src/contact.js";
import { json } from "../../src/http.js";
import { testSite } from "../helpers.js";

const site = testSite();
let day = 0;
const now = () => new Date(Date.UTC(2026, 0, 1, 3) + day * 86400000);

const good = {
  name: "試験 太郎",
  email: "taro@example.com",
  message: "サイトを作りたいです",
  turnstileToken: "token",
  page: "https://shop.example/",
  conv: "c9",
  history: [
    { role: "user", content: "料金は？" },
    { role: "assistant", content: "10,000円です。" },
  ],
};

// Turnstile と Resend への呼び出しを偽物にする。resend は呼ばれた順に ok を返す
function stubNetwork({ turnstile = true, resend = [true, true] } = {}) {
  const sent = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (String(url).includes("turnstile")) return Response.json({ success: turnstile });
    const ok = resend[sent.length] ?? true;
    sent.push(JSON.parse(init.body));
    return new Response(ok ? '{"id":"x"}' : "error", { status: ok ? 200 : 500 });
  });
  return sent;
}

const post = (body, e = {}) =>
  handleContact(
    site,
    new Request("https://w/contact", { method: "POST", headers: { "CF-Connecting-IP": "9.9.9.9" }, body: JSON.stringify(body) }),
    { ...env, TURNSTILE_SECRET: "s", RESEND_API_KEY: "k", ...e },
    (b, s) => json(b, s),
    now()
  ).then(async (r) => ({ status: r.status, body: await r.json() }));

const contactsCount = async () => (await env.LOG.prepare("SELECT COUNT(*) AS n FROM contacts").first()).n;

beforeEach(() => {
  day += 1;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("validateContact", () => {
  it("誤りのある項目の名前を返す", () => {
    expect(validateContact(site, { name: "a", email: "a@b.c", message: "m" })).toEqual([]);
    expect(validateContact(site, { name: "", email: "x", message: "" })).toEqual(["name", "email", "message"]);
    expect(validateContact(site, { name: "あ".repeat(51), email: "a@b.c", message: "m" })).toEqual(["name"]);
    expect(validateContact(site, { name: "a", email: "a@b.c", message: "m".repeat(2001) })).toEqual(["message"]);
  });
});

describe("transcriptOf", () => {
  it("役割の分かる記録だけ、直近から決まった件数", () => {
    const h = Array.from({ length: 25 }, (_, i) => ({ role: "user", content: String(i) }));
    const t = transcriptOf(site, [{ role: "system", content: "x" }, ...h]);
    expect(t).toHaveLength(20);
    expect(t[0].content).toBe("5");
  });
});

describe("POST /contact", () => {
  it("持ち主への知らせと、送った人への控えを送り、件名と日時だけ記録する", async () => {
    const sent = stubNetwork();
    const before = await contactsCount();
    const r = await post(good);
    expect(r).toEqual({ status: 200, body: { ok: true, topic: "Webサイト制作のご相談", replySent: true } });
    expect(sent.map((m) => m.to[0])).toEqual(["owner@shop.example", "taro@example.com"]);
    expect(sent[0]).toMatchObject({ from: "Shop <info@shop.example>", subject: "知らせ（Webサイト制作のご相談）", reply_to: "taro@example.com" });
    expect(sent[1]).toMatchObject({ subject: "控え", reply_to: "owner@shop.example" });
    expect(await contactsCount()).toBe(before + 1);
    const row = await env.LOG.prepare("SELECT * FROM contacts WHERE conv='c9'").first();
    expect(row).toMatchObject({ conv: "c9", topic: "Webサイト制作のご相談" });
    expect(JSON.stringify(row)).not.toContain("taro");
  });

  it("持ち主の端末（owner）からの受付は、メールは送るが記録しない", async () => {
    const sent = stubNetwork();
    const before = await contactsCount();
    const r = await post({ ...good, owner: true });
    expect(r.body.ok).toBe(true);
    expect(sent).toHaveLength(2);
    expect(await contactsCount()).toBe(before);
  });

  it("ボタンから始めた受付（会話なし）は、ボタンの件名を使う", async () => {
    stubNetwork();
    const r = await post({ ...good, message: "自社に導入を検討", history: [], button: "相談したい" });
    expect(r.body.topic).toBe("チャットボットのご相談");
  });

  it("入力に誤りがあれば 400 と項目の名前", async () => {
    const r = await post({ ...good, email: "no-at-mark" });
    expect(r).toEqual({ status: 400, body: { ok: false, error: "invalid", fields: ["email"] } });
  });

  it("Turnstile が通らなければ 403。メールは送らない", async () => {
    const sent = stubNetwork({ turnstile: false });
    expect((await post(good)).status).toBe(403);
    expect(sent).toHaveLength(0);
  });

  it("同じ IP から決まった件数を超えたら 429", async () => {
    stubNetwork();
    for (let i = 0; i < 3; i++) expect((await post(good)).status).toBe(200);
    expect(await post(good)).toEqual({ status: 429, body: { ok: false, error: "limit" } });
  });

  it("持ち主への知らせが送れなければ、受け付けていないので 502。控えも記録も残さない", async () => {
    const sent = stubNetwork({ resend: [false] });
    const before = await contactsCount();
    expect(await post(good)).toEqual({ status: 502, body: { ok: false, error: "send" } });
    expect(sent).toHaveLength(1);
    expect(await contactsCount()).toBe(before);
  });

  it("控えだけ送れなかったときは、受付は済んでいるので ok（二重に送らせない）", async () => {
    stubNetwork({ resend: [true, false] });
    const before = await contactsCount();
    const r = await post(good);
    expect(r.body).toMatchObject({ ok: true, replySent: false });
    expect(await contactsCount()).toBe(before + 1);
  });

  it("RESEND_API_KEY が無ければ送れない", async () => {
    stubNetwork();
    expect((await post(good, { RESEND_API_KEY: "" })).status).toBe(502);
  });

  it("手元の試験のときだけ、RESEND_API_URL に送る", async () => {
    stubNetwork();
    await post(good, { TEST_MODE: "1", RESEND_API_URL: "http://127.0.0.1:8790/emails" });
    const urls = globalThis.fetch.mock.calls.map(([u]) => String(u)).filter((u) => !u.includes("turnstile"));
    expect(urls.every((u) => u === "http://127.0.0.1:8790/emails")).toBe(true);
    vi.mocked(globalThis.fetch).mockClear();
    day += 1;
    await post(good, { RESEND_API_URL: "http://127.0.0.1:8790/emails" });
    const prod = globalThis.fetch.mock.calls.map(([u]) => String(u)).filter((u) => !u.includes("turnstile"));
    expect(prod.every((u) => u === "https://api.resend.com/emails")).toBe(true);
  });
});
