# site-chatbot

サイトに置く、案内役の AI チャットボットです。Cloudflare Workers で動きます。

- 訪問者の困りごとを聞いて、合うサービスとページを案内する（答えの元は、指示文に書き写したサイトの情報だけ）
- 個別の相談は、会話の中で名前・メールアドレス・内容を聞いて、持ち主にメールで届ける（AI を通さない決まった手順）
- 会話を記録し、毎月1日に先月の集計を持ち主にメールで送る
- 1日の回数の上限（同じ IP・サイト全体）で、費用といたずらを抑える
- 画面はページの進み具合で上から下へ動く案内役と、会話の窓。サイトの CSS とぶつからない（Shadow DOM）

## 置き場

```
src/            仕組み（どのサイトでも同じ）
  worker.js       入口。createWorker(サイトの設定, 画面の JS)
  chat.js         POST /chat：AI の答え
  contact.js      POST /contact：問い合わせの受付
  report.js       月ごとの集計（定期実行）
  config.js       サイトの設定の既定の値と確かめ
  widget/         画面（scripts/build-widget.mjs が dist/widget.js に1つにまとめる）
sites/<名前>/   サイトごとの設定（公開するのは sites/example/ だけ。.gitignore）
  site.config.js  指示文・文言・宛先・色・上限など
  index.js        そのサイトの Worker の入口
  wrangler.jsonc  Cloudflare の設定（アカウントの ID）。見本は wrangler.example.jsonc
  public/         案内役の絵
  eval-cases.json AI の試験の質問集
  設計書.md       そのサイトのボットの決めごと（1枚）
  マニュアル.md   お客さま向けの説明（1枚）
  site-shot.webp  手元の確認ページの背景にする画面の写し（任意）
migrations/     会話の記録の表（D1）
test/           unit（サーバー側）・widget（画面）・tools（試験の道具）・e2e（動いている Worker に流す試験）
docs/           仕組み・設定の書き方・試験・リリースの手順
```

見本のサイトは `sites/example/` です。

## 使い方

Node 22 以上が要ります。コマンドは、このフォルダ（`package.json` のある所）で打ちます。

```bash
npm install
npm run check
```

`npm run check` は、画面をまとめ直して単体テストを全部流します。Cloudflare のアカウントも秘密の値も要りません。

自分のサイトに置くまでの手順は [docs/configuration.md](docs/configuration.md)、本番に上げる手順は [docs/release.md](docs/release.md) です。

| コマンド | すること |
|---|---|
| `npm run check` | 画面をまとめ直して、単体テストを全部流す |
| `npm test` / `npm run test:watch` | 単体テストだけ／変えるたびに流す |
| `npm run dev -- -c sites/<名前>/wrangler.jsonc` | そのサイトの設定で、手元で Worker を起動する（http://localhost:8789） |
| `npm run serve:page -- <名前>` | 画面を確かめるページを開く（http://localhost:8788/local.html） |
| `npm run dev:contacttest -- -c sites/<名前>/wrangler.jsonc` → `npm run test:contact -- <名前>` | 受付とメールの試験（AI は呼ばない） |
| `npm run test:ai -- <質問集> <URL>` | AI の試験（AI を本当に呼ぶ。枠を使う） |
| `npm run deploy -- <サイト>` | テストを流してから本番に上げる |

## 資料

- [docs/architecture.md](docs/architecture.md)：仕組み
- [docs/configuration.md](docs/configuration.md)：サイトの設定の書き方
- [docs/testing.md](docs/testing.md)：試験の種類と流し方
- [docs/release.md](docs/release.md)：版の付け方・本番に上げる・前の版に戻す
- [CHANGELOG.md](CHANGELOG.md)：変えたことの記録

## ライセンス

[PolyForm Noncommercial License 1.0.0](LICENSE)。見る・学ぶ・試すのは自由です。商用の利用（販売・業務での利用・有償の導入など）はできません。商用で使いたい場合は untronc（https://untronc.jp）にご相談ください。
