import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { CONFIG_GLOBAL, createWorker } from "../../src/worker.js";
import { testSite } from "../helpers.js";

const worker = createWorker(testSite(), "/*widget*/");

async function call(path, init = {}, e = {}) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request("https://w" + path, init), { ...env, ...e }, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("Worker の入口", () => {
  it("/widget.js：画面用の設定を先頭に付けて、キャッシュさせずに配る", async () => {
    const res = await call("/widget.js", {}, { TURNSTILE_SITEKEY: "sk" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Type")).toMatch(/javascript/);
    const text = await res.text();
    expect(text.startsWith(`window.${CONFIG_GLOBAL}=`)).toBe(true);
    expect(text).toContain('"turnstileSitekey":"sk"');
    expect(text.endsWith("/*widget*/")).toBe(true);
  });

  it("OPTIONS には 204 と CORS", async () => {
    const res = await call("/chat", { method: "OPTIONS", headers: { Origin: "https://shop.example" } });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://shop.example");
  });

  it("許可していないサイトからの呼び出しは 403", async () => {
    const res = await call("/chat", { method: "POST", headers: { Origin: "https://evil.example" }, body: "{}" });
    expect(res.status).toBe(403);
  });

  it("知らない道は 404。静的ファイルの置き場があればそちらへ渡す", async () => {
    expect((await call("/nothing")).status).toBe(404);
    expect((await call("/chat")).status).toBe(404); // GET の /chat は無い
    const ASSETS = { fetch: vi.fn(async () => new Response("img")) };
    const res = await call("/guide.svg", {}, { ASSETS });
    expect(await res.text()).toBe("img");
  });

  it("/chat と /contact に振り分ける", async () => {
    const AI = { run: vi.fn(async () => ({ response: "答え" })) };
    const res = await call(
      "/chat",
      { method: "POST", headers: { Origin: "https://shop.example", "CF-Connecting-IP": "8.8.8.8" }, body: JSON.stringify({ message: "料金" }) },
      { AI }
    );
    expect((await res.json()).reply).toBe("答え");
    const c = await call("/contact", { method: "POST", headers: { Origin: "https://shop.example" }, body: JSON.stringify({}) });
    expect(c.status).toBe(400);
  });
});
