// サイトのページと指示文のずれを見る（AI は呼ばない）。
//   node scripts/check-drift.mjs <サイト名> [--json]
// 指示文の「## 見出し（URL）」ごとに、ページの金額・時間（○分）と、その節の金額・時間を突き合わせる。
// あわせて、設定の allowedYen（載せてよい金額）と指示文の金額が食い違っていないかを見る。
// ずれが1つでもあれば終了コード 1。--json は朝の見回り用（ずれの一覧だけを返す）
const [siteName, ...flags] = process.argv.slice(2);
if (!siteName) {
  console.error("使い方：node scripts/check-drift.mjs <サイト名> [--json]");
  process.exit(2);
}
const json = flags.includes("--json");
const { default: site } = await import(new URL(`../sites/${siteName}/site.config.js`, import.meta.url).href);

const YEN = /(\d{1,3}(?:,\d{3})+)\s*円/g;
const MIN = /(\d{2,3})\s*分/g;
const uniq = (a) => [...new Set(a)];
const pick = (text, re) => uniq([...text.matchAll(re)].map((m) => m[1]));
// 本文（<main>）だけを読む。メニュー・フッターの文字を拾わないため
const mainOf = (html) => /<main[\s>][\s\S]*?<\/main>/i.exec(html)?.[0] ?? html;
const pageText = (html) =>
  mainOf(html)
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&yen;|¥|￥/g, "")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/，/g, ",");

// 指示文を「## 見出し（URL）」の節に分ける
const sections = [];
for (const block of site.prompt.system.split(/\n(?=## )/)) {
  const head = /^## (.+?)（(https?:\/\/[^）\s]+)）/.exec(block);
  if (head) sections.push({ title: head[1], url: head[2], text: block });
}

const drifts = [];
const add = (kind, where, detail) => drifts.push({ kind, where, detail });
const promptYen = pick(site.prompt.system, YEN);
const promptMin = pick(site.prompt.system, MIN);
const allowed = site.allowedYen ?? [];
const seenOnPages = new Set();
const pageYenOf = new Map();

for (const s of sections) {
  let html;
  try {
    const res = await fetch(s.url, { headers: { "User-Agent": "untronc-drift-check" } });
    if (!res.ok) { add("ページが開けない", s.url, `HTTP ${res.status}`); continue; }
    html = await res.text();
  } catch (err) {
    add("ページが開けない", s.url, String(err?.message ?? err));
    continue;
  }
  const text = pageText(html);
  const pageYen = pick(text, YEN);
  const pageMin = pick(text, MIN);
  pageYen.forEach((y) => seenOnPages.add(y));
  pageYenOf.set(s, pageYen);
  // ページにある値は、指示文のどこかにあればよい（一覧のページはほかの節の値をくり返すため）
  for (const y of pageYen) if (!promptYen.includes(y)) add("ページの金額が指示文に無い", s.url, `${y}円（${s.title}）`);
  for (const m of pick(s.text, MIN)) if (!pageMin.includes(m)) add("指示文の時間がページに無い", s.url, `${m}分（${s.title}）`);
  for (const m of pageMin) if (!promptMin.includes(m)) add("ページの時間が指示文に無い", s.url, `${m}分（${s.title}）`);
}
// 指示文の金額は、その節のページか、ほかに見たページ（トップを含む）のどこかにあればよい（「トップページでは」のように別のページを書くことがあるため）
try {
  const top = new URL("/", sections[0]?.url);
  if (!sections.some((s) => s.url === top.href)) {
    const res = await fetch(top, { headers: { "User-Agent": "untronc-drift-check" } });
    if (res.ok) pick(pageText(await res.text()), YEN).forEach((y) => seenOnPages.add(y));
  }
} catch {}
for (const s of sections) {
  if (!pageYenOf.has(s)) continue;
  for (const y of pick(s.text, YEN)) if (!pageYenOf.get(s).includes(y) && !seenOnPages.has(y)) add("指示文の金額がページに無い", s.url, `${y}円（${s.title}）`);
}
for (const y of promptYen) if (!allowed.includes(y)) add("指示文の金額が allowedYen に無い", "site.config.js", `${y}円`);
for (const y of allowed) if (!promptYen.includes(y)) add("allowedYen の金額が指示文に無い", "site.config.js", `${y}円`);

if (json) {
  console.log(JSON.stringify({ site: siteName, checkedAt: new Date().toISOString(), pages: sections.length, drifts }));
} else {
  console.log(`${siteName}：ページ ${sections.length} 枚を見た。ずれ ${drifts.length} 件`);
  for (const d of drifts) console.log(`- ${d.kind}：${d.detail}　${d.where}`);
}
process.exit(drifts.length ? 1 : 0);
