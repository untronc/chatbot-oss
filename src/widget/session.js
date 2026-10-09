// 会話の記録（このタブの中だけ。ページを移っても続く）。sessionStorage が使えないときは、そのページの中だけで持つ。

export function createSession(storage, prefix) {
  const LOG_KEY = `${prefix}-log`;
  const CONV_KEY = `${prefix}-conv`;
  const state = { history: [], saved: [] };

  const safe = (fn, fallback) => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };

  // 会話の札（月ごとの集計で「会話した人」を数えるため）。タブごとの乱数で、人を特定しない
  const newConv = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  const conv =
    safe(() => storage.getItem(CONV_KEY), null) ||
    (() => {
      const c = newConv();
      safe(() => storage.setItem(CONV_KEY, c));
      return c;
    })();

  return {
    conv,
    get history() {
      return state.history;
    },
    get saved() {
      return state.saved;
    },
    load() {
      const d = safe(() => JSON.parse(storage.getItem(LOG_KEY) || "null"), null);
      if (d && Array.isArray(d.saved)) {
        state.history = Array.isArray(d.history) ? d.history : [];
        state.saved = d.saved;
        return true;
      }
      return false;
    },
    save() {
      safe(() => storage.setItem(LOG_KEY, JSON.stringify(state)));
    },
    keep(role, text) {
      state.saved.push({ role, text });
      this.save();
    },
    // AI に渡す会話。長くなりすぎないよう、上限の2倍まで持つ
    pushExchange(question, answer, maxMessages) {
      state.history = [...state.history, { role: "user", content: question }, { role: "assistant", content: answer }].slice(
        -maxMessages * 2
      );
      this.save();
    },
    // 最初に戻る：このタブの会話を消す
    clear() {
      state.history = [];
      state.saved = [];
      this.save();
    },
    // まだ何も話していない（あいさつだけ）か
    hasUserMessage() {
      return state.saved.some((m) => m.role === "user");
    },
  };
}
