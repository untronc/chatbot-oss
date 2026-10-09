// AI の試験。質問集を、動いている Worker に流して自動で採点する。AI を本当に呼ぶので、Workers AI の枠を使う。
// 試験は、機能を足して本番に上げる前にだけ流す。流す前に「1回の消費 × 回数」と1日の枠を確かめる。
//
// 使い方（chatbot-oss フォルダで）：
//   npm run dev -- -c sites/<名前>/wrangler.jsonc     … 手元で Worker を起動（別の窓で）
//   npm run test:ai -- sites/<名前>/eval-cases.json http://localhost:8789 [--daily | ID ...]
// 本番に流すときは ORIGIN=<そのサイトの URL> を付ける（本番は localhost を受け付けない）
// 結果は test/e2e/results/ に Markdown で書く。

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { judge, selectCases, yenIn } from "./judge.js";

const [casesPath, base = "http://localhost:8789", ...args] = process.argv.slice(2);
if (!casesPath) {
  console.error("使い方: node test/e2e/run-eval.mjs <質問集の JSON> [Worker の URL] [--daily | ID ...]");
  process.exit(2);
}
const ORIGIN = process.env.ORIGIN || "http://localhost:8788";
const suite = JSON.parse(readFileSync(casesPath, "utf8"));

async function ask(q, history = []) {
  const res = await fetch(base + "/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ message: q, history }),
  });
  return res.json();
}

const rows = [];
const drift = [];
let pass = 0;
for (const c of selectCases(suite.cases, args)) {
  const yenSets = [];
  for (let i = 0; i < c.times; i++) {
    let r;
    try {
      r = await ask(c.q, c.history || []);
    } catch (e) {
      r = { reply: `（呼び出し失敗：${e.message}）` };
    }
    const bad = judge(suite, c, r);
    if (!bad.length) pass++;
    yenSets.push(yenIn(r.reply || "").sort().join("・"));
    rows.push({ id: c.times > 1 ? `${c.id}-${i + 1}` : c.id, kind: c.kind, q: c.q, ok: !bad.length, why: bad.join(" / "), r });
    process.stdout.write(bad.length ? "x" : ".");
  }
  if (c.times > 1 && new Set(yenSets).size > 1) drift.push(`${c.id}：回によって金額が違う（${yenSets.join(" ／ ")}）`);
}

const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
const esc = (s) => String(s).replace(/\|/g, "｜").replace(/\n/g, " ");
const md = [
  `# AI の試験の結果（${stamp}）`,
  "",
  `- 質問集：${casesPath}`,
  `- 合格 ${pass} / ${rows.length}（呼び出し ${rows.length} 回）`,
  `- 答えのぶれ：${drift.length ? "" : "なし"}`,
  ...drift.map((d) => `  - ${d}`),
  "",
  "| ID | 種類 | 質問 | 判定 | 理由 | 受付ボタン | 答え |",
  "|---|---|---|---|---|---|---|",
  ...rows.map((x) => `| ${x.id} | ${x.kind} | ${esc(x.q)} | ${x.ok ? "合格" : "**不合格**"} | ${esc(x.why)} | ${x.r.offerContact ? "出る" : ""} | ${esc(x.r.reply || "")} |`),
  "",
].join("\n");
const dir = join(dirname(fileURLToPath(import.meta.url)), "results");
mkdirSync(dir, { recursive: true });
const out = join(dir, `eval-${stamp}.md`);
writeFileSync(out, md, "utf8");
console.log(`\n合格 ${pass}/${rows.length}  ぶれ ${drift.length}件  → ${out}`);
process.exitCode = pass === rows.length ? 0 : 1;
