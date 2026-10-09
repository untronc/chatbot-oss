// 返事の組み立てと、呼び出し元（Origin）の確かめ。

// 手元の試験（.dev.vars の TEST_MODE=1）のときだけ受け付ける、試験用のページ
export const TEST_ORIGIN = "http://localhost:8788";

export const isTestMode = (env) => env?.TEST_MODE === "1";

export function allowedOrigins(site, env) {
  return isTestMode(env) ? [...site.allowedOrigins, TEST_ORIGIN] : site.allowedOrigins;
}

export function isAllowedOrigin(site, env, origin) {
  return allowedOrigins(site, env).includes(origin);
}

export function corsHeaders(site, env, origin) {
  const allow = isAllowedOrigin(site, env, origin) ? origin : site.allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// 回数制限に使う IP。手元の試験のときだけ X-Test-IP で差し替えられる（試験どうしの数が混ざらないように）
export function clientIp(request, env) {
  return (isTestMode(env) && request.headers.get("X-Test-IP")) || request.headers.get("CF-Connecting-IP") || "unknown";
}
