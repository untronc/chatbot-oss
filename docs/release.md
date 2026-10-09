# リリース

## 版の付け方

`package.json` の `version` を使います（例：0.1.0）。

- 答え方・画面・受付の動きが変わる → 2つめの数を上げる（0.1.0 → 0.2.0）
- 不具合を直しただけ → 3つめの数を上げる（0.1.0 → 0.1.1）
- 設定の書き方が変わり、各サイトの `site.config.js` を直す必要がある → 1つめの数を上げる

## 本番に上げる手順

1. `CHANGELOG.md` の「まだ上げていない」に、変えたことを書く
2. AI の答えに関わる変更（指示文・答えの後始末・モデル）なら、AI の試験を1回流す（[testing.md](testing.md)）
3. `package.json` の `version` を上げ、`CHANGELOG.md` の見出しをその版と日付にする
4. D1 の表を変えたときは、先に `npx wrangler d1 migrations apply LOG --remote -c sites/<名前>/wrangler.jsonc`
5. `npm run deploy -- <サイト>`
   - 画面をまとめ直し、単体テストを全部流す。落ちたら上げない
   - Cloudflare の版の記録に、版の番号（`v0.1.0` など）を付けて上げる
6. 本番で確かめる：`/widget.js` を取り直して中身が新しいか、サイトで窓を開けるか
7. コミットし、版の番号のタグを付けて GitHub に上げる（下の「コード管理」）

## マイグレーション（D1 の表）

- ファイルは `migrations/V0001__説明.sql` の形（Flyway の名前の決まり）。番号は4桁で埋める（wrangler は名前を文字の順に並べるため）
- 汎用 SQL で書く。SQLite（D1）・PostgreSQL・MySQL で同じ文が通る形にする
  - ID は `id VARCHAR(36) PRIMARY KEY` にして、アプリが UUID（`crypto.randomUUID()`）を入れる。DB に番号を振らせない
  - 表は `CREATE TABLE IF NOT EXISTS`。索引は `CREATE INDEX`（MySQL に `CREATE INDEX IF NOT EXISTS` が無いため付けない。同じファイルを2回流さないのはマイグレーションの道具が受け持つ）
  - 索引を張る列は `VARCHAR(n)`。型は `VARCHAR`・`TEXT`・`INTEGER` だけを使う
- 当てたファイルは書き換えない。変えるときは次の番号のファイルを足す

## コード管理

- ブランチは `main` 1本。`main` は本番に出ている版と同じにする
- 本番に上げたら、その版のタグ（`v0.1.0` など）を付ける
- GitHub に上げるのは本番に上げたあと。上げる前に、出すファイルを持ち主に見せて了承をもらう
- サイトごとの設定（`sites/<名前>/`。見本の `sites/example/` を除く）・`.dev.vars`・試験の結果は入れない（`.gitignore`）

```bash
git tag v0.1.0
git push origin main --tags
```

## 前の版に戻す

```bash
npx wrangler deployments list -c sites/<名前>/wrangler.jsonc    # 上げた記録（版の番号つき）
npx wrangler rollback <版の ID> -c sites/<名前>/wrangler.jsonc
```

- 戻せるのは Worker のコードと設定だけ。D1 の表や秘密の値は戻らない
- 戻したら、`CHANGELOG.md` に戻したことと理由を書く

## 秘密の値

| 名前 | 中身 | 入れ方 |
|---|---|---|
| `TURNSTILE_SECRET` | Turnstile の秘密の鍵 | `npx wrangler secret put TURNSTILE_SECRET -c ...` か Cloudflare の画面 |
| `RESEND_API_KEY` | Resend の API の鍵 | 同上 |

ファイルや会話に値を書きません。
