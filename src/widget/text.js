// 文字の扱い（DOM を使わないので、そのまま単体テストできる）

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// URL の終わりに来やすい記号。URL の一部にしない（「…/ai-chatbot/。」の「。」までリンクにしていた）
const URL_RE = /https?:\/\/[^\s<>"'）)」』】、。，．！？]+/g;
const TRAILING = /[.,!?:;]+$/;

// 文の中の URL をリンクにする。同じサイトの中は同じタブで開く（会話はタブの中で続く）
export function linkify(text, currentHost) {
  return escapeHtml(text).replace(URL_RE, (match) => {
    const tail = (match.match(TRAILING) || [""])[0];
    const u = tail ? match.slice(0, -tail.length) : match;
    let same = false;
    try {
      same = new URL(u.replace(/&amp;/g, "&")).host === currentHost;
    } catch {
      // URL として読めなければ、よそのページとして扱う
    }
    return `<a href="${u}"${same ? "" : ' target="_blank" rel="noopener"'}>${u}</a>${tail}`;
  });
}

// 決まった言葉の一つと同じか（前後の空白は無視）
export function isOneOf(text, words) {
  const t = String(text).trim();
  return words.some((w) => w === t);
}
