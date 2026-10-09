// 画面を丸ごと立ち上げて、利用者の操作どおりに確かめる（ブラウザの代わりに happy-dom）
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { widgetConfig } from "../../src/config.js";
import { testSite } from "../helpers.js";

const ORIGIN = "https://w.example";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot({ sitekey = "sk", seed } = {}) {
  window.__chatFairyLoaded = false;
  window.__chatFairyConfig = widgetConfig(testSite(), { TURNSTILE_SITEKEY: sitekey });
  sessionStorage.clear();
  if (seed) sessionStorage.setItem("chat-fairy-log", JSON.stringify(seed));
  document.body.innerHTML = "";
  Object.defineProperty(document, "currentScript", { value: { src: ORIGIN + "/widget.js" }, configurable: true });
  vi.resetModules();
  await import("../../src/widget/index.js");
  const root = document.getElementById("chat-fairy").shadowRoot;
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => [...root.querySelectorAll(s)];
  return {
    $,
    $$,
    open: async () => {
      $(".launcher").click();
      await wait(400);
    },
    say: async (text) => {
      $(".inp input").value = text;
      $(".inp").dispatchEvent(new Event("submit", { cancelable: true }));
      await wait(0);
    },
    chip: async (label) => {
      $$(".chip").find((b) => b.textContent === label).click();
      await wait(0);
    },
    texts: () => $$(".msg p").map((p) => p.textContent),
    chips: () => $$(".chip").map((b) => b.textContent),
  };
}

let fetchMock;
beforeEach(() => {
  fetchMock = vi.fn(async () => Response.json({ reply: "1ページ 10,000円（税込）です。", offerContact: false }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete window.turnstile;
});

describe("開く", () => {
  it("初めて開くと、あいさつとボタン", async () => {
    const w = await boot();
    await w.open();
    expect(w.texts()).toEqual(["こんにちは"]);
    expect(w.chips()).toEqual(["料金", "相談したい"]);
  });

  it("あいさつだけでページを移っても、ボタンを出し直す", async () => {
    const w = await boot({ seed: { history: [], saved: [{ role: "bot", text: "こんにちは" }] } });
    await w.open();
    expect(w.texts()).toEqual(["こんにちは"]);
    expect(w.chips()).toEqual(["料金", "相談したい"]);
  });

  it("話したあとの続きには、ボタンを出さない", async () => {
    const saved = [{ role: "bot", text: "こんにちは" }, { role: "user", text: "料金" }, { role: "bot", text: "10,000円です" }];
    const w = await boot({ seed: { history: [], saved } });
    await w.open();
    expect(w.texts()).toEqual(["こんにちは", "料金", "10,000円です"]);
    expect(w.chips()).toEqual([]);
  });
});

describe("閉じる", () => {
  // 指やマウスで閉じたときに案内役へフォーカスを戻すと、案内役に緑の枠が残る（iPhone の Safari）
  const activeIn = (w) => w.$(".launcher").getRootNode().activeElement;

  it("指やマウスで × を押したときは、案内役へフォーカスを戻さない", async () => {
    const w = await boot();
    await w.open();
    w.$(".inp input").focus();
    w.$(".x").dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(w.$(".panel").classList.contains("open")).toBe(false);
    expect(activeIn(w)).not.toBe(w.$(".launcher"));
    expect(activeIn(w)).not.toBe(w.$(".inp input"));
  });

  it("キーボードで × を押したときは、案内役へフォーカスを戻す", async () => {
    const w = await boot();
    await w.open();
    w.$(".x").dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    expect(activeIn(w)).toBe(w.$(".launcher"));
  });

  it("Esc で閉じたときは、案内役へフォーカスを戻す", async () => {
    const w = await boot();
    await w.open();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(w.$(".panel").classList.contains("open")).toBe(false);
    expect(activeIn(w)).toBe(w.$(".launcher"));
  });
});

describe("最初に戻る", () => {
  it("会話を消して、あいさつとボタンを出し直す。保存した会話も消える", async () => {
    const w = await boot();
    await w.open();
    await w.chip("料金");
    await wait(0);
    expect(w.texts().length).toBeGreaterThan(1);
    w.$(".reset").click();
    expect(w.texts()).toEqual(["こんにちは"]);
    expect(w.chips()).toEqual(["料金", "相談したい"]);
    const saved = JSON.parse(sessionStorage.getItem("chat-fairy-log"));
    expect(saved.history).toEqual([]);
    expect(saved.saved.map((m) => m.text)).toEqual(["こんにちは"]);
  });

  it("受付の途中で押すと、受付をやめる（次の入力は AI への質問になる）", async () => {
    const w = await boot();
    await w.open();
    await w.chip("相談したい");
    w.$(".reset").click();
    await w.say("料金は？");
    await wait(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/chat");
  });
});

describe("AI との会話", () => {
  it("ボタンの文を質問として送り、答えを出す", async () => {
    const w = await boot();
    await w.open();
    await w.chip("料金");
    await wait(0);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(ORIGIN + "/chat");
    expect(JSON.parse(init.body)).toMatchObject({ message: "料金", button: "料金", history: [] });
    expect(w.texts().at(-1)).toBe("1ページ 10,000円（税込）です。");
  });

  it("持ち主の端末の印があれば、owner を付けて送り、GA4 には送らない", async () => {
    localStorage.setItem("chat-fairy-owner", "1");
    const gtag = vi.fn();
    window.gtag = gtag;
    try {
      const w = await boot();
      await w.open();
      await w.chip("料金");
      await wait(0);
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).owner).toBe(true);
      expect(gtag).not.toHaveBeenCalled();
    } finally {
      localStorage.removeItem("chat-fairy-owner");
      delete window.gtag;
    }
  });

  it("印が無ければ owner を付けず、GA4 に送る", async () => {
    const gtag = vi.fn();
    window.gtag = gtag;
    try {
      const w = await boot();
      await w.open();
      await w.chip("料金");
      await wait(0);
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).owner).toBeUndefined();
      expect(gtag).toHaveBeenCalled();
    } finally {
      delete window.gtag;
    }
  });

  it("2回続けて答えられなかったら、問い合わせのボタンを出す", async () => {
    fetchMock.mockImplementation(async () => Response.json({ reply: "お答えできません", unanswered: true, offerContact: true }));
    const w = await boot();
    await w.open();
    await w.say("天気は？");
    await wait(0);
    expect(w.chips()).not.toContain("問い合わせる");
    await w.say("株価は？");
    await wait(0);
    expect(w.chips()).toContain("問い合わせる");
  });

  it("通信に失敗したら、問い合わせのボタンを出す", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const w = await boot();
    await w.open();
    await w.say("料金は？");
    await wait(0);
    expect(w.chips()).toContain("問い合わせる");
  });
});

describe("会話の中での問い合わせの受付", () => {
  async function untilConfirm(w) {
    await w.open();
    await w.chip("相談したい");
    await w.say("太郎");
    await w.say("taro@example.com");
    await w.say("導入を検討しています");
  }

  it("名前・メール・内容を聞いて確認を出し、送ると結果を出す。受付の入力は記録に残さない", async () => {
    window.turnstile = { render: (_el, o) => (o.callback("tok"), 1), remove: vi.fn() };
    fetchMock.mockImplementation(async () => Response.json({ ok: true, topic: "チャットボットのご相談", replySent: true }));
    const w = await boot();
    await untilConfirm(w);
    expect(w.$(".confirm").textContent).toContain("taro@example.com");
    await wait(0);
    await w.chip("送信する");
    await wait(0);
    const body = JSON.parse(fetchMock.mock.calls.at(-1)[1].body);
    expect(body).toMatchObject({ name: "太郎", email: "taro@example.com", message: "導入を検討しています", turnstileToken: "tok", button: "相談したい" });
    expect(w.texts().at(-2)).toContain("taro@example.com に控えのメールをお送りしました");
    const log = sessionStorage.getItem("chat-fairy-log");
    expect(log).not.toContain("taro@example.com");
    expect(log).toContain("お問い合わせを受け付けました");
  });

  it("「直す」でやり直しても、受付を始めたボタン（件名の手がかり）は残る", async () => {
    window.turnstile = { render: (_el, o) => (o.callback("tok"), 1), remove: vi.fn() };
    fetchMock.mockImplementation(async () => Response.json({ ok: true, replySent: true }));
    const w = await boot();
    await untilConfirm(w);
    await w.chip("直す");
    await w.say("花子");
    await w.say("hana@example.com");
    await w.say("やはり相談したい");
    await wait(0);
    await w.chip("送信する");
    await wait(0);
    expect(JSON.parse(fetchMock.mock.calls.at(-1)[1].body).button).toBe("相談したい");
  });

  it("控えだけ送れなかったときは、その旨を出す", async () => {
    window.turnstile = { render: (_el, o) => (o.callback("tok"), 1), remove: vi.fn() };
    fetchMock.mockImplementation(async () => Response.json({ ok: true, replySent: false }));
    const w = await boot();
    await untilConfirm(w);
    await wait(0);
    await w.chip("送信する");
    await wait(0);
    expect(w.texts()).toContain(testSite().widget.text.sentNoCopy);
  });

  it("サイトキーが無いときは、待たせずにフォームへ案内する", async () => {
    const w = await boot({ sitekey: "" });
    await untilConfirm(w);
    expect(w.texts().at(-1)).toBe(testSite().widget.text.noCheck);
  });

  it("「やめる」と打つと取りやめ", async () => {
    const w = await boot();
    await w.open();
    await w.chip("相談したい");
    await w.say("やめる");
    expect(w.texts().at(-1)).toBe(testSite().widget.text.cancelled);
  });
});
