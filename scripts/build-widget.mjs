// 画面（src/widget/）を1つのファイル dist/widget.js にまとめる。wrangler の build.command から呼ばれる。
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

await build({
  entryPoints: [root + "src/widget/index.js"],
  outfile: root + "dist/widget.js",
  bundle: true,
  format: "iife",
  target: "es2020",
  minify: process.argv.includes("--minify"),
  legalComments: "none",
  logLevel: "warning",
});
