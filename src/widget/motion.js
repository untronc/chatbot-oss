// 案内役の動き。ページの進み具合で上から下へ動き、スクロールの速さで羽ばたきと傾きが変わる。

const IDLE = 0.3; // 止まっているときの羽の速さ
const FLAP_HALF = 0.14; // 羽の片道の秒数（速さ1のとき）
const MAX_TILT = 35; // 前後の傾きの最大（度）
const DUST_STEP = 8; // 何 px 進むごとに1粒こぼすか
const GAP_ABOVE_ANCHOR = 12; // 下の目印（「トップへ戻る」など）の上に空ける間
const GAP_BELOW_HEADER = 8; // ヘッダーの下に空ける間
const SPARK_COLORS = ["#f5b700", "#ff8fb1", "#ffcf4d", "#f7a8ff"];

// 一番上で止まる高さ：サイトのヘッダーの下（メニューに重なってクリックを奪わないため）
export function topLimit({ viewport, header }) {
  const min = viewport * 0.06;
  if (!header) return min;
  const bottom = header.fixed ? header.bottom : header.bottom + header.scrollY;
  return Math.min(viewport * 0.4, Math.max(min, bottom + GAP_BELOW_HEADER));
}

// 一番下で止まる高さ：下の目印があればその上、無ければ下から24px
export function bottomGap(anchor) {
  return anchor ? anchor.bottom + anchor.height + GAP_ABOVE_ANCHOR : 24;
}

// 上から下へ動かすページか。paths が無ければ全部のページで動かす。それ以外のページでは右下に止めておく
export function movesHere(paths, pathname) {
  return !Array.isArray(paths) || paths.includes(pathname);
}

// ページの進み具合 p（0〜1）から、案内役の上端の位置。moving が false なら、一番下の位置に止める
export function guideY({ scrollY, scrollHeight, viewport, guideHeight, top, gap, moving = true }) {
  if (!moving) return viewport - guideHeight - gap;
  const max = Math.max(1, scrollHeight - viewport);
  const p = Math.min(1, Math.max(0, scrollY / max));
  const bottom = viewport - guideHeight - gap;
  return top + (bottom - top) * p;
}

function measureHeader(selector) {
  const h = selector && document.querySelector(selector);
  if (!h) return null;
  const pos = getComputedStyle(h).position;
  return { bottom: h.getBoundingClientRect().bottom, scrollY: window.scrollY, fixed: pos === "fixed" || pos === "sticky" };
}

function measureAnchor(anchor) {
  const wrap = anchor && document.querySelector(anchor.wrap);
  if (!wrap) return null;
  const btn = anchor.button && wrap.querySelector(anchor.button);
  return { bottom: parseFloat(getComputedStyle(wrap).bottom) || 0, height: btn ? btn.offsetHeight : 52 };
}

export function startMotion({ root, guide, hopEl, tiltEl, launcher, dust, panel, layout, reduce }) {
  const moving = movesHere(layout.moveOnPaths, location.pathname);
  let curY = null;
  let lastScroll = window.scrollY;
  let lastT = performance.now();
  let lastDir = 1;
  let dustDist = 0;
  let speed = IDLE;
  let idleTimer = null;

  function setFlap(s) {
    if (Math.abs(s - speed) < 0.05) return;
    speed = s;
    const d = (FLAP_HALF / s).toFixed(3) + "s";
    root.querySelectorAll(".wing").forEach((w) => (w.style.animationDuration = d));
  }

  function dropSpark(dir) {
    const box = launcher.getBoundingClientRect();
    const el = document.createElement("span");
    const c = SPARK_COLORS[(Math.random() * SPARK_COLORS.length) | 0];
    el.className = "spark";
    el.textContent = ["✦", "✧", "•"][(Math.random() * 3) | 0];
    el.style.color = c;
    el.style.textShadow = "0 0 6px " + c;
    el.style.fontSize = (8 + Math.random() * 8).toFixed(0) + "px";
    dust.appendChild(el);
    const x = box.left + box.width * (0.25 + Math.random() * 0.5);
    const y = box.top + box.height * (dir > 0 ? 0.15 + Math.random() * 0.3 : 0.55 + Math.random() * 0.3);
    const dx = Math.random() * 60 - 30;
    const dy = -dir * (70 + Math.random() * 70);
    const rot = Math.random() * 240 - 120;
    if (!el.animate) return el.remove();
    const anim = el.animate(
      [
        { transform: `translate(${x}px,${y}px) scale(1)`, opacity: 1 },
        { transform: `translate(${x + dx}px,${y + dy}px) rotate(${rot}deg) scale(.2)`, opacity: 0 },
      ],
      { duration: 800 + Math.random() * 500, easing: "ease-out" }
    );
    anim.onfinish = () => el.remove();
  }

  function onScroll() {
    if (reduce || panel.classList.contains("open")) return;
    const now = performance.now();
    const dy = window.scrollY - lastScroll;
    const v = (dy / Math.max(16, now - lastT)) * 1000; // px/秒
    lastScroll = window.scrollY;
    lastT = now;
    if (!dy) return;
    const dir = dy > 0 ? 1 : -1;
    setFlap(1 + Math.min(Math.abs(v) / 1500, 1.5));
    dustDist += Math.abs(dy);
    for (let n = 0; dustDist >= DUST_STEP && n < 5; n++) {
      dropSpark(dir);
      dustDist -= DUST_STEP;
    }
    dustDist = Math.min(dustDist, DUST_STEP);
    // 止まったら、まっすぐに戻す
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      tiltEl.style.transform = "";
      setFlap(IDLE);
    }, 150);
    // 右下に止めておくページでは、傾きと跳ねはしない（羽ばたきとキラキラだけ）
    if (!moving) return;
    // 下へ進むと前のめり、上へ戻るとのけぞる
    const tilt = -Math.max(-MAX_TILT, Math.min(MAX_TILT, v / 60));
    tiltEl.style.transform = `perspective(500px) rotateX(${tilt.toFixed(1)}deg)`;
    // 向きが変わった瞬間、進む方向へ小さく跳ねる
    if (dir !== lastDir) {
      lastDir = dir;
      hopEl.style.transform = `translateY(${dir * 14}px)`;
      setTimeout(() => {
        hopEl.style.transition = "transform .35s ease-in-out";
        hopEl.style.transform = "";
      }, 120);
      setTimeout(() => (hopEl.style.transition = ""), 500);
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });

  // ページの進み具合に、少し遅れてついていく
  function frame() {
    const t = guideY({
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewport: window.innerHeight,
      guideHeight: guide.offsetHeight,
      top: topLimit({ viewport: window.innerHeight, header: measureHeader(layout.headerSelector) }),
      gap: bottomGap(measureAnchor(layout.bottomAnchor)),
      moving,
    });
    curY = curY == null ? t : curY + (t - curY) * (reduce ? 1 : 0.12);
    guide.style.transform = `translateY(${curY.toFixed(1)}px)`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
