// Worker の入口。サイトの設定と、組み立てた画面の JS を受け取って、fetch と scheduled を返す。
//   GET  /widget.js  画面の JS（先頭に画面用の設定を付けて配る）
//   POST /chat       AI の答え
//   POST /contact    問い合わせの受付
//   それ以外         静的ファイル（案内役の絵など。wrangler の assets）
import { handleChat } from "./chat.js";
import { widgetConfig } from "./config.js";
import { handleContact } from "./contact.js";
import { corsHeaders, isAllowedOrigin, json } from "./http.js";
import { monthlyReport } from "./report.js";

export const CONFIG_GLOBAL = "__chatFairyConfig";

export function createWorker(site, widgetJs) {
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      const origin = request.headers.get("Origin") || "";

      if (url.pathname === "/widget.js") {
        const config = `window.${CONFIG_GLOBAL}=${JSON.stringify(widgetConfig(site, env))};\n`;
        return new Response(config + widgetJs, {
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            // 古い版が残る事故を避けるため、キャッシュさせない
            "Cache-Control": "no-store",
          },
        });
      }

      const cors = corsHeaders(site, env, origin);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

      const route = request.method === "POST" ? { "/chat": "chat", "/contact": "contact" }[url.pathname] : undefined;
      if (!route) {
        if (env.ASSETS && request.method === "GET") return env.ASSETS.fetch(request);
        return new Response("Not found", { status: 404 });
      }
      if (!isAllowedOrigin(site, env, origin)) return json({ error: "forbidden" }, 403, cors);

      const respond = (body, status) => json(body, status, cors);
      return route === "chat" ? handleChat(site, request, env, ctx, respond) : handleContact(site, request, env, respond);
    },

    async scheduled(event, env, ctx) {
      ctx.waitUntil(monthlyReport(site, env));
    },
  };
}
