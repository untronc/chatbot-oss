import { describe, expect, it } from "vitest";
import { maskPersonal } from "../../src/log.js";

describe("maskPersonal（記録に入れる前の伏せ字）", () => {
  it.each([
    ["taro.yamada@example.com に送ってください", "［メールアドレス］ に送ってください"],
    ["山田です。taro+bot@mail.example.co.jpに見積もりを", "山田です。［メールアドレス］に見積もりを"],
    ["連絡先は taro＠example.com です", "連絡先は ［メールアドレス］ です"],
  ])("メールアドレスを伏せる：%s", (input, out) => {
    expect(maskPersonal(input)).toBe(out);
  });

  it.each([
    ["電話は090-1234-5678です", "電話は［電話番号］です"],
    ["09012345678 にお願いします", "［電話番号］ にお願いします"],
    ["03-1234-5678", "［電話番号］"],
    ["０９０－１２３４－５６７８まで", "［電話番号］まで"],
    ["0120 123 456", "［電話番号］"],
    ["+81-90-1234-5678 です", "［電話番号］ です"],
    ["(03)1234-5678", "(［電話番号］"],
  ])("電話番号を伏せる：%s", (input, out) => {
    expect(maskPersonal(input)).toBe(out);
  });

  it.each([
    "一般導入 150,000円（税別）です",
    "2026-10-11 に相談したい",
    "10ページだといくらですか",
    "郵便番号は123-4567です",
    "山田太郎です",
    "",
  ])("伏せないもの：%s", (input) => {
    expect(maskPersonal(input)).toBe(input);
  });

  it("空・null は空の文字にする", () => {
    expect(maskPersonal(null)).toBe("");
    expect(maskPersonal(undefined)).toBe("");
  });
});
