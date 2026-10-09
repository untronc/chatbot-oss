// 画面の見た目。色はサイトの設定（widget.theme）から CSS の変数に入れる。Shadow DOM の中なので、サイトの CSS とぶつからない。

export function themeVars(theme) {
  return Object.entries(theme)
    .map(([k, v]) => `--cf-${k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}: ${v};`)
    .join(" ");
}

export function css(theme, fontFamily) {
  return `
    :host { all: initial; ${themeVars(theme)} }
    * { box-sizing: border-box; margin: 0; padding: 0; }

    /* 案内役。ページの進み具合で上から下へ動く */
    .guide { position: fixed; top: 0; right: 24px; width: 170px; z-index: 2147482999; pointer-events: none; will-change: transform; }
    .tilt { transform-origin: 50% 40%; transition: transform .4s cubic-bezier(.2,.7,.3,1); }
    .hop { transition: transform .12s ease-out; }
    .bob { display: block; position: relative; aspect-ratio: 360 / 365; animation: bob 1.4s ease-in-out infinite alternate; }
    .bob img { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
    .wing { animation: flap var(--flap, .47s) ease-in-out infinite alternate; will-change: transform; }
    .wing-l { transform-origin: 47% 45%; }
    .wing-r { transform-origin: 53% 45%; }
    @keyframes flap { to { transform: scaleX(.6); } }
    @keyframes bob { to { transform: translateY(-12px); } }
    .launcher { display: block; width: 100%; border: 0; padding: 0; background: none; cursor: pointer; pointer-events: auto; -webkit-tap-highlight-color: transparent; transition: opacity .25s, transform .25s; }
    .launcher:focus-visible { outline: 3px solid var(--cf-primary); outline-offset: 4px; border-radius: 12px; }
    .launcher.pop { animation: pop .55s cubic-bezier(.3,1.6,.5,1); }
    @keyframes pop { 35% { transform: scale(1.22) translateY(-14px); } 70% { transform: scale(.96); } }
    .launcher.hide { opacity: 0; transform: scale(.6) translateY(20px); pointer-events: none; }
    .reduce .bob, .reduce .wing { animation: none; }

    /* キラキラの粉 */
    .dust { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 2147482998; }
    .spark { position: absolute; left: 0; top: 0; line-height: 1; }

    /* 会話の窓 */
    .panel { position: fixed; right: 24px; bottom: 24px; width: 360px; max-width: calc(100vw - 32px); height: 560px; max-height: calc(100vh - 48px);
      display: none; flex-direction: column; border-radius: 18px; overflow: hidden; z-index: 2147483000;
      background: #fff; box-shadow: 0 16px 45px rgba(31,58,43,.25); font-family: ${fontFamily}; color: var(--cf-text); }
    .panel.open { display: flex; }
    header { flex: none; display: flex; align-items: center; gap: 8px; padding: 10px 12px 10px 14px; background: var(--cf-primary); color: #fff; }
    header .ava { width: 40px; height: 40px; border-radius: 50%; flex: none; background: #fff; border: 2px solid #fff; object-fit: cover; }
    header .ttl { font-family: "游ゴシック体", "Yu Gothic", YuGothic, "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, sans-serif; font-weight: 700; font-size: 17px; letter-spacing: .06em; white-space: nowrap; }
    header .reset { margin-left: auto; flex: none; font: inherit; font-size: 12px; line-height: 1; padding: 7px 9px; border-radius: 999px; border: 1px solid rgba(255,255,255,.8); background: transparent; color: #fff; cursor: pointer; white-space: nowrap; }
    header .reset:hover { background: rgba(255,255,255,.15); }
    header .x { flex: none; width: 40px; height: 40px; border-radius: 50%; border: 0; display: grid; place-items: center; background: #fff; color: var(--cf-close-icon); cursor: pointer; }
    header .x:hover { background: var(--cf-primary-soft); }
    .log { flex: 1; overflow: auto; padding: 14px 13px 6px; background: var(--cf-surface); }
    .msg { display: flex; gap: 8px; align-items: flex-start; margin: 0 0 14px; }
    .msg img { width: 38px; height: 38px; border-radius: 50%; flex: none; background: #fff; border: 1px solid var(--cf-input-border); object-fit: cover; }
    .msg p { max-width: 80%; padding: 10px 13px; font-size: 15px; line-height: 1.7; background: #fff; border: 1px solid var(--cf-border); border-radius: 3px 14px 14px 14px; white-space: pre-wrap; word-break: break-word; }
    .msg.me { justify-content: flex-end; }
    .msg.me p { background: var(--cf-primary); border-color: var(--cf-primary); color: #fff; border-radius: 14px 3px 14px 14px; }
    .msg p a { color: var(--cf-primary); word-break: break-all; }
    .msg.typing p { color: var(--cf-muted); }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: -4px 0 14px 46px; }
    .chip { font: inherit; font-size: 13px; line-height: 1.4; padding: 7px 12px; border-radius: 999px; border: 1px solid var(--cf-primary); background: #fff; color: var(--cf-primary); cursor: pointer; text-align: left; }
    .chip:hover { background: var(--cf-primary-soft); }
    .chip.main { background: var(--cf-primary); color: #fff; }
    .confirm { margin: 0 0 14px; padding: 12px 8px; background: #fff; border: 1px solid var(--cf-border); border-radius: 12px; font-size: 14px; line-height: 1.7; }
    .confirm dt { font-size: 12px; color: var(--cf-muted); }
    .confirm dd { margin: 0 0 6px; white-space: pre-wrap; word-break: break-word; }
    .confirm .policy { font-size: 12px; color: var(--cf-muted); margin: 6px 0 8px; }
    .confirm .policy a { color: var(--cf-primary); }
    .confirm .ts { min-height: 0; margin: 4px 0 8px; }
    .inp { flex: none; display: flex; gap: 8px; padding: 10px 12px 4px; border-top: 1px solid var(--cf-divider); background: #fff; }
    .inp input { flex: 1; min-width: 0; border: 1px solid var(--cf-input-border); border-radius: 999px; padding: 10px 16px; font: inherit; font-size: 14px; background: #fff; outline: none; color: var(--cf-text); }
    .inp input:focus { border-color: var(--cf-primary); }
    .inp button { flex: none; width: 44px; height: 44px; border: 0; border-radius: 50%; display: grid; place-items: center; background: var(--cf-primary); color: #fff; cursor: pointer; }
    .inp button:disabled { opacity: .45; cursor: default; }
    .inp button svg { margin-left: -2px; }
    .foot { flex: none; text-align: left; font-size: 13px; white-space: pre-line; color: var(--cf-muted); padding: 2px 16px 10px; background: #fff; }

    @media (max-width: 640px) { .guide { width: 110px; right: 8px; } .panel { right: 8px; bottom: 8px; max-height: calc(100vh - 16px); } header { gap: 6px; padding-left: 12px; } header .reset { font-size: 11px; padding: 6px 7px; } }
    /* 「最初に戻る」を足して、幅 360px 以下では × がはみ出したので、見出しまわりを詰める */
    @media (max-width: 360px) { header { gap: 4px; padding-left: 10px; padding-right: 8px; } header .ava { width: 32px; height: 32px; } header .ttl { font-size: 15px; letter-spacing: 0; } header .reset { font-size: 10px; padding: 5px 6px; } }
  `;
}
