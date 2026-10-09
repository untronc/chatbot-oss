// 手元で画面を見るための最小のサーバー。ポートは src/http.js の TEST_ORIGIN に合わせて 8788 固定。
// 使い方：npm run serve:page -- <サイトの名前>。sites/<名前>/site-shot.webp（そのサイトの画面の写し）があれば背景に使う
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8788;
const ROOT = __dirname;
const SITE = process.argv[2] ? path.join(ROOT, "..", "..", "sites", process.argv[2]) : null;

http
  .createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]);
    const file =
      rel === "/site-shot.webp" && SITE ? path.join(SITE, "site-shot.webp") : path.join(ROOT, rel === "/" ? "index.html" : rel);
    // このフォルダの中と、サイトの画面の写しだけを返す（../ でほかのファイルを読ませない）
    const shot = SITE && path.join(SITE, "site-shot.webp");
    if (!(file.startsWith(ROOT + path.sep) || file === shot)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404).end("not found");
        return;
      }
      const type = file.endsWith(".html")
        ? "text/html; charset=utf-8"
        : file.endsWith(".js")
        ? "application/javascript; charset=utf-8"
        : file.endsWith(".webp")
        ? "image/webp"
        : "text/plain; charset=utf-8";
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
      res.end(data);
    });
  })
  .listen(PORT, () => console.log("動作確認ページ: http://localhost:" + PORT));
