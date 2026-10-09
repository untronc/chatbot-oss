// 持ち主の端末の印。ページを ?chatbot_owner=on で一度開くと、その端末（ブラウザ）の会話は記録・GA4 に入れない。
// ?chatbot_owner=off で外す。印は localStorage に置くので、タブを閉じても残る。印を付けても会話と受付のメールは普段どおり動く。
export const OWNER_PARAM = "chatbot_owner";

export function ownerFlag(getStorage, prefix, search) {
  const key = `${prefix}-owner`;
  try {
    const storage = getStorage();
    const p = new URLSearchParams(search).get(OWNER_PARAM);
    if (p === "on") storage.setItem(key, "1");
    if (p === "off") storage.removeItem(key);
    return storage.getItem(key) === "1";
  } catch {
    return false; // localStorage が使えないときは、ふつうの訪問者として扱う
  }
}
