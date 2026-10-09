// Cloudflare Turnstile の確かめ（https://developers.cloudflare.com/turnstile/get-started/server-side-validation/）
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(secret, token, ip) {
  if (!secret || !token) return false;
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token, remoteip: ip }),
    });
    const out = await res.json();
    return out.success === true;
  } catch {
    return false;
  }
}
