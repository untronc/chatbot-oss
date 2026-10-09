// 会話の中での問い合わせの受付の手順（AI を通さない）。画面に依存しない形で書き、単体テストできるようにしている。
// step：name → email → message → confirm → sending
import { isOneOf } from "./text.js";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function startFlow(button = "") {
  return { step: "name", button };
}

// 入力を1つ受けて、次の状態と、画面でやること（action）を返す。flow は書き換えない
//   action：ask（次の項目を聞く。key は文言の名前）／retry（入力の誤り）／confirm（確認を出す）／cancel／useButtons
export function nextStep(flow, input, limits, cancelWords) {
  const text = String(input).trim();
  if (isOneOf(text, cancelWords)) return { flow: null, action: { type: "cancel" } };
  switch (flow.step) {
    case "name":
      if (!text || text.length > limits.maxName) return { flow, action: { type: "retry", key: "badName" } };
      return { flow: { ...flow, name: text, step: "email" }, action: { type: "ask", key: "askEmail" } };
    case "email":
      if (!EMAIL_RE.test(text) || text.length > 254) return { flow, action: { type: "retry", key: "badEmail" } };
      return { flow: { ...flow, email: text, step: "message" }, action: { type: "ask", key: "askMessage" } };
    case "message":
      if (!text || text.length > limits.maxMessage) return { flow, action: { type: "retry", key: "badMessage" } };
      return { flow: { ...flow, message: text, step: "confirm" }, action: { type: "confirm" } };
    case "confirm":
      return { flow, action: { type: "retry", key: "useButtons" } };
    default:
      return { flow, action: { type: "none" } };
  }
}

// 「直す」：名前から聞き直す。受付を始めたボタンは覚えておく（件名を決めるのに使う）
export function restartFlow(flow) {
  return startFlow(flow?.button || "");
}

// 送信の結果を、画面に出す文言の名前にする
export function resultMessageKey(res) {
  if (res?.ok) return res.replySent === false ? "sentNoCopy" : "sent";
  return { invalid: "badInput", limit: "limit", turnstile: "badCheck" }[res?.error] || "sendError";
}
