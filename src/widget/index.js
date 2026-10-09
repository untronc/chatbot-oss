// サイトに埋め込まれて、訪問者のブラウザで動く画面。scripts/build-widget.mjs が1つのファイルにまとめ、Worker が /widget.js で配る。
// 設定は Worker が先頭に付ける window.__chatFairyConfig から読む。通信先と絵の置き場は、このファイルを配ったオリジンから決める。
import { nextStep, restartFlow, resultMessageKey, startFlow } from "./contact-flow.js";
import { startMotion } from "./motion.js";
import { ownerFlag } from "./owner.js";
import { createSession } from "./session.js";
import { css } from "./styles.js";
import { escapeHtml, linkify } from "./text.js";

const CONFIG_GLOBAL = "__chatFairyConfig";
const LOADED_FLAG = "__chatFairyLoaded";
const TURNSTILE_JS = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

const ICON_CLOSE =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const ICON_SEND =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>';

function boot() {
  if (window[LOADED_FLAG]) return;
  window[LOADED_FLAG] = true;

  const src = document.currentScript?.src;
  if (!src) return;
  const ORIGIN = new URL(src).origin;
  const cfg = window[CONFIG_GLOBAL] || {};
  const T = cfg.text || {};
  const img = (p) => (/^https?:/.test(p) ? p : ORIGIN + p);
  const IMG = { body: img(cfg.images.body), wingL: img(cfg.images.wingL), wingR: img(cfg.images.wingR), face: img(cfg.images.face) };
  const reduce = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const session = createSession(window.sessionStorage, cfg.storagePrefix);
  const owner = ownerFlag(() => window.localStorage, cfg.storagePrefix, location.search);
  const ownerMark = owner ? { owner: true } : {};

  // サイトに GA4 があれば送る
  const track = (name, params) => {
    if (owner) return; // 持ち主の端末は数えない
    try {
      if (name && typeof window.gtag === "function") window.gtag("event", name, params || {});
    } catch {
      // 計測に失敗しても会話は止めない
    }
  };

  // 本文の書体。Shadow DOM の中でも、ページに読み込んだ書体は使える
  if (cfg.font?.stylesheet && !document.querySelector(`link[data-${cfg.storagePrefix}-font]`)) {
    const font = document.createElement("link");
    font.rel = "stylesheet";
    font.href = cfg.font.stylesheet;
    font.setAttribute(`data-${cfg.storagePrefix}-font`, "");
    document.head.appendChild(font);
  }

  const host = document.createElement("div");
  host.id = cfg.storagePrefix;
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = css(cfg.theme, cfg.font?.family || "sans-serif");
  root.appendChild(style);

  const wrap = document.createElement("div");
  if (reduce) wrap.className = "reduce";
  wrap.innerHTML = `
    <div class="dust" aria-hidden="true"></div>
    <div class="guide"><div class="hop"><div class="tilt">
      <button class="launcher" aria-label="${escapeHtml(T.openLabel)}">
        <span class="bob"><img class="wing wing-l" alt=""><img class="wing wing-r" alt=""><img class="body" alt=""></span>
      </button>
    </div></div></div>
    <div class="panel" role="dialog" aria-label="${escapeHtml(T.title)}">
      <header><img class="ava" alt=""><span class="ttl"></span><button class="reset" type="button">${escapeHtml(T.resetLabel)}</button><button class="x" aria-label="${escapeHtml(T.closeLabel)}">${ICON_CLOSE}</button></header>
      <div class="log" aria-live="polite"></div>
      <form class="inp"><input type="text" maxlength="${cfg.maxMessageLength}" autocomplete="off"><button type="submit" aria-label="${escapeHtml(T.sendLabel)}">${ICON_SEND}</button></form>
      <div class="foot"></div>
    </div>`;
  root.appendChild(wrap);

  const $ = (s) => root.querySelector(s);
  const panel = $(".panel");
  const log = $(".log");
  const form = $(".inp");
  const input = $(".inp input");
  const sendBtn = $(".inp button");
  const launcher = $(".launcher");
  $(".wing-l").src = IMG.wingL;
  $(".wing-r").src = IMG.wingR;
  $(".body").src = IMG.body;
  $(".ava").src = IMG.face;
  $(".ttl").textContent = T.title;
  input.placeholder = T.placeholder;
  $(".foot").textContent = T.foot;

  startMotion({ root, guide: $(".guide"), hopEl: $(".hop"), tiltEl: $(".tilt"), launcher, dust: $(".dust"), panel, layout: cfg.layout, reduce });

  // ---------------- 画面の部品 ----------------
  function add(role, text, opts = {}) {
    const row = document.createElement("div");
    row.className = "msg" + (role === "user" ? " me" : "") + (opts.typing ? " typing" : "");
    if (role !== "user") {
      const face = document.createElement("img");
      face.src = IMG.face;
      face.alt = "";
      row.appendChild(face);
    }
    const p = document.createElement("p");
    p.innerHTML = linkify(text, location.host);
    row.appendChild(p);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    if (!opts.typing && opts.keep !== false) session.keep(role, text);
    return row;
  }
  function chips(items) {
    const box = document.createElement("div");
    box.className = "chips";
    for (const it of items) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (it.main ? " main" : "");
      b.textContent = it.label;
      b.addEventListener("click", () => {
        box.remove();
        it.onClick();
      });
      box.appendChild(b);
    }
    log.appendChild(box);
    log.scrollTop = log.scrollHeight;
    return box;
  }
  const contactChip = () => chips([{ label: T.contactButton, main: true, onClick: () => startContact() }]);
  log.addEventListener("click", (e) => {
    const a = e.target.closest?.("a");
    if (a) track(cfg.analytics.linkClick, { link_url: a.href });
  });

  // ---------------- 開く・閉じる ----------------
  let greeted = false;
  function openPanel() {
    panel.classList.add("open");
    launcher.classList.add("hide");
    if (!greeted) {
      greeted = true;
      if (session.load() && session.saved.length) {
        for (const m of session.saved) add(m.role, m.text, { keep: false });
        // まだ何も話していない（あいさつだけ）なら、ボタンも出し直す。話したあとの続きには出さない
        if (!session.hasUserMessage()) showQuickReplies();
      } else {
        add("bot", T.greeting);
        showQuickReplies();
      }
    }
    track(cfg.analytics.open);
    setTimeout(() => input.focus(), 50);
  }
  // キーボードで閉じたときだけ、案内役へフォーカスを戻す。指やマウスで閉じたときに戻すと、
  // ブラウザがキーボード操作の枠（:focus-visible）を案内役に出したままにする（iPhone の Safari で起きた）
  function closePanel(byKeyboard) {
    panel.classList.remove("open");
    launcher.classList.remove("hide");
    if (byKeyboard) launcher.focus();
    else root.activeElement?.blur();
  }
  launcher.addEventListener("click", () => {
    launcher.classList.remove("pop");
    void launcher.offsetWidth;
    launcher.classList.add("pop");
    $(".tilt").style.transform = "";
    setTimeout(openPanel, reduce ? 0 : 350); // 跳ねたあとに窓を開く
  });
  // キーボード（Enter・Space）で押した click は detail が 0
  $(".x").addEventListener("click", (e) => closePanel(e.detail === 0));
  // 最初に戻る：会話を消して、あいさつとボタンを出し直す
  $(".reset").addEventListener("click", () => {
    if (busy) return;
    flow = null;
    unansweredStreak = 0;
    log.innerHTML = "";
    session.clear();
    add("bot", T.greeting);
    showQuickReplies();
    input.focus();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("open")) closePanel(true);
  });

  function showQuickReplies() {
    chips(
      cfg.quickReplies.map((q) => ({
        label: q.label,
        onClick: () => {
          if (q.contact) {
            add("user", q.label);
            startContact(q.label);
          } else ask(q.label, q.label);
        },
      }))
    );
  }

  // ---------------- AI との会話 ----------------
  let busy = false;
  let unansweredStreak = 0;
  function ask(text, button = "") {
    if (busy) return;
    busy = true;
    sendBtn.disabled = true;
    add("user", text);
    const typing = add("bot", "…", { typing: true });
    fetch(ORIGIN + "/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        history: session.history.slice(-cfg.maxHistoryMessages),
        conv: session.conv,
        page: location.href,
        button,
        ...ownerMark,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        typing.remove();
        const reply = d.reply || T.error;
        add("bot", reply);
        session.pushExchange(text, reply, cfg.maxHistoryMessages);
        unansweredStreak = d.unanswered ? unansweredStreak + 1 : 0;
        // 受付ボタン：相談の申し出など（Worker が判断）。答えられなかったときは2回続いたら
        if ((d.offerContact && !d.unanswered) || unansweredStreak >= 2) contactChip();
      })
      .catch(() => {
        typing.remove();
        add("bot", T.error);
        contactChip();
      })
      .finally(() => {
        busy = false;
        sendBtn.disabled = false;
        input.focus();
      });
  }

  // ---------------- 会話の中での問い合わせの受付（AI を通さない決まった手順） ----------------
  let flow = null;
  function startContact(button = "") {
    flow = startFlow(button);
    unansweredStreak = 0;
    add("bot", T.askName);
  }
  function cancelContact() {
    flow = null;
    add("bot", T.cancelled);
  }
  function onFlowInput(text) {
    // 受付で入力された名前・連絡先・相談の中身は、会話の記録にも AI にも入れない
    add("user", text, { keep: false });
    const next = nextStep(flow, text, { maxName: cfg.maxName, maxMessage: cfg.maxMessage }, T.cancelWords);
    flow = next.flow;
    const a = next.action;
    if (a.type === "cancel") return cancelContact();
    if (a.type === "ask" || a.type === "retry") return add("bot", T[a.key], { keep: false });
    if (a.type === "confirm") return showConfirm();
  }

  // Turnstile（迷惑な送信を防ぐ）。確認の画面で初めて読み込む
  let tsReady = null;
  function loadTurnstile() {
    if (tsReady) return tsReady;
    tsReady = new Promise((resolve, reject) => {
      if (window.turnstile) return resolve(window.turnstile);
      const s = document.createElement("script");
      s.src = TURNSTILE_JS;
      s.async = true;
      s.onload = () => resolve(window.turnstile);
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return tsReady;
  }

  function showConfirm() {
    const L = T.confirmLabels;
    const box = document.createElement("div");
    box.className = "confirm";
    box.innerHTML = `<dl><dt>${escapeHtml(L.name)}</dt><dd></dd><dt>${escapeHtml(L.email)}</dt><dd></dd><dt>${escapeHtml(
      L.message
    )}</dt><dd></dd></dl><p class="policy"></p><div class="ts"></div>`;
    const dds = box.querySelectorAll("dd");
    dds[0].textContent = flow.name;
    dds[1].textContent = flow.email;
    dds[2].textContent = flow.message;
    box.querySelector(".policy").innerHTML = T.policyUrl
      ? escapeHtml(T.policy).replace(
          escapeHtml(T.policyLinkText),
          `<a href="${escapeHtml(T.policyUrl)}" target="_blank" rel="noopener">${escapeHtml(T.policyLinkText)}</a>`
        )
      : escapeHtml(T.policy);
    add("bot", T.confirmLead, { keep: false });
    log.appendChild(box);

    // サイトキーが無ければ確認を出せないので、送れない。黙って待たせず、フォームへ案内する
    if (!cfg.turnstileSitekey) {
      add("bot", T.noCheck, { keep: false });
      flow = null;
      return;
    }
    let token = "";
    let widgetId = null;
    loadTurnstile()
      .then((ts) => {
        const slot = box.querySelector(".ts");
        widgetId = ts.render(slot, {
          sitekey: cfg.turnstileSitekey,
          // flexible は幅 300px より狭くなれない。窓が狭いと会話の欄に横のスクロールが出るので、そのときは小さい形にする
          size: slot.clientWidth >= 300 ? "flexible" : "compact",
          callback: (t) => (token = t),
          "expired-callback": () => (token = ""),
        });
      })
      .catch(() => add("bot", T.noCheck, { keep: false }));

    const B = T.confirmButtons;
    const buttons = chips([
      { label: B.send, main: true, onClick: () => send() },
      {
        label: B.edit,
        onClick: () => {
          box.remove();
          flow = restartFlow(flow);
          add("bot", T.askName, { keep: false });
        },
      },
      {
        label: B.cancel,
        onClick: () => {
          box.remove();
          cancelContact();
        },
      },
    ]);

    function send() {
      if (!token) {
        add("bot", T.waitCheck, { keep: false });
        log.appendChild(buttons); // ボタンを出し直す
        return;
      }
      const f = flow;
      flow = { ...f, step: "sending" };
      add("bot", T.sending, { keep: false });
      fetch(ORIGIN + "/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: f.name,
          email: f.email,
          message: f.message,
          turnstileToken: token,
          page: location.href,
          history: session.history,
          conv: session.conv,
          button: f.button,
          ...ownerMark,
        }),
      })
        .then((r) => r.json())
        .then((d) => {
          add("bot", String(T[resultMessageKey(d)] || "").replace("{email}", f.email), { keep: false });
          if (d.ok) {
            add("bot", T.sentLog, { keep: true }); // 記録には「受け付けた」ことだけ残す
            track(cfg.analytics.contact, { topic: d.topic || "" });
            box.remove();
          }
        })
        .catch(() => add("bot", T.sendError, { keep: false }))
        .finally(() => {
          flow = null;
          try {
            if (widgetId != null) window.turnstile.remove(widgetId);
          } catch {
            // 片づけに失敗しても困らない
          }
        });
    }
  }

  // ---------------- 入力欄 ----------------
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || busy) return;
    input.value = "";
    if (flow && flow.step !== "sending") return onFlowInput(text);
    ask(text);
  });
}

boot();
