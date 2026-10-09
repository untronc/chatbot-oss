// 本番に上げる。上げる前に、画面をまとめ直して単体テストを全部流し、落ちたら上げない。
// Cloudflare の版の記録に、package.json の版の番号を付ける（前の版へ戻すときの目印。docs/release.md）。
// 使い方：npm run deploy -- <サイトの名前>     例：npm run deploy -- example
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const site = process.argv[2];
const config = `sites/${site}/wrangler.jsonc`;
if (!site || !existsSync(config)) {
  console.error(`サイトの名前を渡してください（${config} がありません）`);
  process.exit(2);
}
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });

run("npm", ["run", "check"]);
run("npx", ["wrangler", "deploy", "-c", config, "--tag", `v${version}`, "--message", `v${version}`]);
console.log(`\n${site} に v${version} を上げました。前の版へ戻すときは docs/release.md`);
