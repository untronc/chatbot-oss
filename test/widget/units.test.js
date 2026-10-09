import { describe, expect, it } from "vitest";
import { nextStep, restartFlow, resultMessageKey, startFlow } from "../../src/widget/contact-flow.js";
import { bottomGap, guideY, movesHere, topLimit } from "../../src/widget/motion.js";
import { ownerFlag } from "../../src/widget/owner.js";
import { createSession } from "../../src/widget/session.js";
import { themeVars } from "../../src/widget/styles.js";
import { escapeHtml, isOneOf, linkify } from "../../src/widget/text.js";

describe("escapeHtml / linkify", () => {
  it("HTML として読まれる文字を無害にする", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });

  it("同じサイトの URL は同じタブ、よそは新しいタブ", () => {
    expect(linkify("https://shop.example/a/", "shop.example")).toBe('<a href="https://shop.example/a/">https://shop.example/a/</a>');
    expect(linkify("https://other.example/", "shop.example")).toContain('target="_blank" rel="noopener"');
  });

  it("URL のすぐ後ろの句読点や括弧は、リンクに含めない", () => {
    expect(linkify("こちら：https://shop.example/a/。", "shop.example")).toBe(
      'こちら：<a href="https://shop.example/a/">https://shop.example/a/</a>。'
    );
    expect(linkify("（https://shop.example/b/）", "shop.example")).toContain(">https://shop.example/b/</a>）");
    expect(linkify("see https://shop.example/c.", "shop.example")).toContain(">https://shop.example/c</a>.");
  });

  it("URL の中の & は崩さない", () => {
    expect(linkify("https://shop.example/?a=1&b=2", "shop.example")).toBe(
      '<a href="https://shop.example/?a=1&amp;b=2">https://shop.example/?a=1&amp;b=2</a>'
    );
  });

  it("本文の中のタグは文字として出す", () => {
    expect(linkify("<script>x</script>", "h")).toBe("&lt;script&gt;x&lt;/script&gt;");
  });

  it("決まった言葉と同じか", () => {
    expect(isOneOf(" やめる ", ["やめる"])).toBe(true);
    expect(isOneOf("やめる理由", ["やめる"])).toBe(false);
  });
});

describe("問い合わせの受付の手順", () => {
  const limits = { maxName: 50, maxMessage: 2000 };
  const cancel = ["やめる", "キャンセル"];

  it("名前 → メール → 内容 → 確認", () => {
    let s = nextStep(startFlow("相談したい"), "太郎", limits, cancel);
    expect(s.action).toEqual({ type: "ask", key: "askEmail" });
    s = nextStep(s.flow, "taro@example.com", limits, cancel);
    expect(s.action).toEqual({ type: "ask", key: "askMessage" });
    s = nextStep(s.flow, "相談です", limits, cancel);
    expect(s.action).toEqual({ type: "confirm" });
    expect(s.flow).toEqual({ step: "confirm", button: "相談したい", name: "太郎", email: "taro@example.com", message: "相談です" });
  });

  it("誤りは同じ項目を聞き直す", () => {
    expect(nextStep(startFlow(), "あ".repeat(51), limits, cancel).action).toEqual({ type: "retry", key: "badName" });
    expect(nextStep({ step: "email" }, "no-at", limits, cancel).action).toEqual({ type: "retry", key: "badEmail" });
    expect(nextStep({ step: "message" }, "", limits, cancel).action).toEqual({ type: "retry", key: "badMessage" });
  });

  it("確認の画面で文字を打ったら、ボタンを使うよう案内する", () => {
    expect(nextStep({ step: "confirm" }, "はい", limits, cancel).action).toEqual({ type: "retry", key: "useButtons" });
  });

  it("どの項目でも「やめる」で取りやめ", () => {
    expect(nextStep({ step: "email" }, "やめる", limits, cancel)).toEqual({ flow: null, action: { type: "cancel" } });
  });

  it("「直す」は名前から聞き直すが、受付を始めたボタンは覚えておく", () => {
    expect(restartFlow({ step: "confirm", button: "相談したい", name: "x" })).toEqual({ step: "name", button: "相談したい" });
  });

  it("送信の結果の文言", () => {
    expect(resultMessageKey({ ok: true, replySent: true })).toBe("sent");
    expect(resultMessageKey({ ok: true, replySent: false })).toBe("sentNoCopy");
    expect(resultMessageKey({ ok: false, error: "limit" })).toBe("limit");
    expect(resultMessageKey({ ok: false, error: "turnstile" })).toBe("badCheck");
    expect(resultMessageKey({ ok: false, error: "send" })).toBe("sendError");
    expect(resultMessageKey(undefined)).toBe("sendError");
  });
});

describe("会話の記録（タブの中）", () => {
  const memory = () => {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
  };

  it("会話の札はタブの中で変わらない", () => {
    const st = memory();
    expect(createSession(st, "p").conv).toBe(createSession(st, "p").conv);
  });

  it("保存して、ページを移ったあとに読み戻せる", () => {
    const st = memory();
    const a = createSession(st, "p");
    a.keep("bot", "こんにちは");
    const b = createSession(st, "p");
    expect(b.load()).toBe(true);
    expect(b.saved).toEqual([{ role: "bot", text: "こんにちは" }]);
    expect(b.hasUserMessage()).toBe(false);
    b.keep("user", "料金");
    expect(b.hasUserMessage()).toBe(true);
  });

  it("AI に渡す会話は上限の2倍まで", () => {
    const s = createSession(memory(), "p");
    for (let i = 0; i < 10; i++) s.pushExchange("q" + i, "a" + i, 4);
    expect(s.history).toHaveLength(8);
    expect(s.history[0]).toEqual({ role: "user", content: "q6" });
  });

  it("保存できない環境でも止まらない", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    const s = createSession(broken, "p");
    expect(s.conv).toMatch(/\w+/);
    expect(s.load()).toBe(false);
    expect(() => s.keep("bot", "x")).not.toThrow();
  });
});

describe("案内役の位置", () => {
  it("ヘッダーの下から動き出す。固定のヘッダーは画面上の位置で見る", () => {
    expect(topLimit({ viewport: 1000, header: { bottom: 120, scrollY: 0, fixed: false } })).toBe(128);
    expect(topLimit({ viewport: 1000, header: { bottom: -880, scrollY: 1000, fixed: false } })).toBe(128);
    expect(topLimit({ viewport: 1000, header: { bottom: 64, scrollY: 1000, fixed: true } })).toBe(72);
  });

  it("ヘッダーが無ければ画面の6%、大きすぎるヘッダーでも画面の40%まで", () => {
    expect(topLimit({ viewport: 1000, header: null })).toBe(60);
    expect(topLimit({ viewport: 1000, header: { bottom: 900, scrollY: 0, fixed: false } })).toBe(400);
  });

  it("下の目印があればその上で止まる", () => {
    expect(bottomGap(null)).toBe(24);
    expect(bottomGap({ bottom: 40, height: 52 })).toBe(104);
  });

  it("ページの進み具合で上から下へ", () => {
    const base = { scrollHeight: 3000, viewport: 1000, guideHeight: 170, top: 128, gap: 24 };
    expect(guideY({ ...base, scrollY: 0 })).toBe(128);
    expect(guideY({ ...base, scrollY: 2000 })).toBe(1000 - 170 - 24);
    expect(guideY({ ...base, scrollY: 1000 })).toBe((128 + 806) / 2);
  });
});

describe("色", () => {
  it("設定の色を CSS の変数にする", () => {
    expect(themeVars({ primary: "#111", primarySoft: "#222" })).toBe("--cf-primary: #111; --cf-primary-soft: #222;");
  });
});

describe("持ち主の端末の印", () => {
  const memory = () => {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  };

  it("?chatbot_owner=on で付き、付けたあとは URL に無くても残る。off で外れる", () => {
    const st = memory();
    expect(ownerFlag(() => st, "p", "")).toBe(false);
    expect(ownerFlag(() => st, "p", "?chatbot_owner=on")).toBe(true);
    expect(ownerFlag(() => st, "p", "?x=1")).toBe(true);
    expect(ownerFlag(() => st, "p", "?chatbot_owner=off")).toBe(false);
    expect(ownerFlag(() => st, "p", "")).toBe(false);
  });

  it("localStorage が使えないときは、ふつうの訪問者として扱う", () => {
    expect(
      ownerFlag(() => {
        throw new Error("blocked");
      }, "p", "?chatbot_owner=on")
    ).toBe(false);
  });
});

describe("上から下へ動かすページ", () => {
  it("道の指定が無ければ、どのページでも動く", () => {
    expect(movesHere(null, "/blog/a/")).toBe(true);
  });

  it("指定があれば、そのページだけ動き、ほかは止まる", () => {
    expect(movesHere(["/"], "/")).toBe(true);
    expect(movesHere(["/"], "/blog/a/")).toBe(false);
  });

  it("止めるページでは、スクロールに関わらず一番下の位置", () => {
    const base = { scrollHeight: 3000, viewport: 800, guideHeight: 170, top: 80, gap: 104 };
    expect(guideY({ ...base, scrollY: 0, moving: false })).toBe(800 - 170 - 104);
    expect(guideY({ ...base, scrollY: 1000, moving: false })).toBe(800 - 170 - 104);
    expect(guideY({ ...base, scrollY: 0 })).toBe(80);
  });
});
