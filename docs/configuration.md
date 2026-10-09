# サイトの設定の書き方

サイトごとに `sites/<名前>/` を1つ作ります。`sites/example/` を写して書き換えるのが早いです。

## 置くもの

| ファイル | 中身 |
|---|---|
| `site.config.js` | このサイトの設定（下の表）。`defineSite({...})` で書く |
| `index.js` | Worker の入口。example のものをそのまま使う |
| `wrangler.jsonc` | Cloudflare の設定。`sites/example/wrangler.example.jsonc` を写し、`<...>` を書き換える |
| `.dev.vars` | 手元で動かすときの値。ルートの `.dev.vars.example` を写す |
| `public/` | 案内役の絵（体・左の羽・右の羽・顔） |
| `eval-cases.json` | AI の試験の質問集（[testing.md](testing.md)） |

`wrangler.jsonc` と `.dev.vars` は、アカウントの ID や手元の値が入るので公開しません。

## Cloudflare の準備

```bash
npx wrangler d1 create <name>                  # 出てきた ID を wrangler.jsonc へ
npx wrangler kv namespace create RATE          # 出てきた ID を wrangler.jsonc へ
npx wrangler d1 migrations apply LOG --remote -c sites/<名前>/wrangler.jsonc
npx wrangler secret put TURNSTILE_SECRET -c sites/<名前>/wrangler.jsonc
npx wrangler secret put RESEND_API_KEY -c sites/<名前>/wrangler.jsonc
```

- Turnstile のウィジェットは Cloudflare の画面で作り、サイトキーを `wrangler.jsonc` の `vars.TURNSTILE_SITEKEY` に書く
- Resend では、差出人のドメインを確認済みにしておく

## site.config.js

`defineSite()` が既定の値で埋めます。必ず書くものは ★。足りないと起動の前に止まり、足りない名前を並べて知らせます。

| 値 | 意味 | 既定 |
|---|---|---|
| ★ `name` | メールの件名などに出すサイトの名前 | |
| ★ `allowedOrigins` | 受け付けるドメイン（`https://...`） | |
| ★ `prompt.system` | AI への指示文。答えてよい情報は全部ここに書き写す | |
| `prompt.unansweredPhrase` | 答えられないときに必ず言わせる文。これが出たかで「答えられなかった」を数える | 「申し訳ありません、その内容はこちらではお答えできません。」 |
| `prompt.contactTag` | 受付を勧めるときに AI に付けさせる印（画面には出さない） | `[受付]` |
| `prompt.leakMarkers` | 答えにこれが入ったら、指示文が漏れたとみなして差し替える | なし |
| ★ `contact.url` | お問い合わせフォームの URL（AI が使えないときに案内する） | |
| `contact.intent` | 質問がこれに当たったら、問い合わせのボタンを出す | 相談・見積・依頼など |
| `contact.reply` | 相談の申し出を「お答えできません」で返したときに差し替える文 | |
| `contact.listedOnly` | 料金ページの無いサービス `{ re, reply }`。「対応しています」を添えて受付へ | なし |
| `contact.topics` | 件名の当て方 `{ label, re }`。上から順に見る | なし |
| `contact.fallbackTopic` | どれにも当たらないときの件名 | 「その他のご相談」 |
| `allowedYen` | ページに載っている金額。集計で「違う金額の疑い」を拾うのに使う | なし |
| `limits.perIpPerDay` | 同じ IP から1日に AI を呼べる回数 | 20 |
| `limits.sitePerDay` | サイト全体で1日に AI を呼べる回数 | 77 |
| `limits.contactsPerIpPerDay` | 同じ IP から1日に受け付ける問い合わせ | 3 |
| `retentionDays` | 会話の記録を残す日数 | 365 |
| `ai.model` / `ai.maxTokens` | Workers AI のモデル／答えの長さの上限 | Llama 3.3 70B／400 |
| `ai.maxHistoryMessages` | AI に渡す直近の会話の件数 | 8 |
| ★ `mail.from` | 差出人（Resend で確認済みのドメイン） | |
| ★ `mail.owner` | 知らせ・集計の宛先 | |
| `mail.replyTo` | 控えにお客さまが返信したときの宛先 | `mail.owner` |
| ★ `mail.ownerMail(d)` | 持ち主への知らせ `{ subject, body, replyTo }` | |
| ★ `mail.replyMail(d)` | 送った人への控え `{ subject, body }` | |
| `mail.limitMail(limit, now)` | サイト全体の上限に達した日の知らせ | 決まった文面 |
| `messages.*` | 上限・AI が使えないときに返す文 | |
| ★ `widget.greeting` | 最初のあいさつ | |
| `widget.quickReplies` | 最初に出すボタン `{ label, contact?, topic? }`。`contact: true` は押すと受付を始め、`topic` はそのときの件名 | なし |
| `widget.text.*` | 画面の文言（見出し・入力欄・受付の各文） | 既定の日本語 |
| `widget.theme.*` | 色（`primary` など） | 深い緑 |
| `widget.images` | 案内役の絵（`public/` からの道か、`https://...`） | `/guide-*.svg` |
| `widget.layout.headerSelector` | 案内役がこの要素の下から動き出す（メニューに重ねない） | `header` |
| `widget.layout.bottomAnchor` | この要素の上で止まる（「トップへ戻る」ボタンなど）`{ wrap, button }` | なし |
| `widget.layout.moveOnPaths` | 上から下へ動かすページの道（`["/"]` など）。ほかのページでは右下に止まり、羽ばたきとキラキラだけ残す | なし（全部のページで動く） |
| `widget.analytics.*` | GA4 に送るイベントの名前（サイトに gtag があるときだけ送る） | `chatbot_open` など |
| `widget.storagePrefix` | 画面の要素の ID・保存の名前の頭 | `chat-fairy` |

`mail.ownerMail(d)` などに渡る `d`：`name`・`email`・`message`・`topic`・`page`・`transcript`（それまでの会話 `{ role, content }`）・`at`（ISO の日時）。

## サイトに置く

```html
<script src="https://<Worker の URL>/widget.js" defer></script>
```

WordPress なら、子テーマの `functions.php` の `wp_footer` で全ページに出せます。
