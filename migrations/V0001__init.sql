-- 会話の記録。受付で入力された名前・メールアドレス・相談の中身は入れない
-- 保存期間を過ぎた行は、毎月の定期実行で消す
-- 汎用 SQL で書く（SQLite・PostgreSQL・MySQL で同じ文が通る形。docs/release.md の「マイグレーション」）
CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(36) PRIMARY KEY,    -- アプリが作る UUID
  at VARCHAR(32) NOT NULL,       -- 日時（ISO・UTC）
  conv VARCHAR(40),              -- 会話の札（ブラウザのタブごとの乱数。人を特定しない）
  page TEXT,                     -- 話したページ
  button TEXT,                   -- 押したボタン（文字で打ったときは空）
  question TEXT,
  answer TEXT,
  topic TEXT,                    -- どのサービスの話か（AIなしで会話の言葉から）
  unanswered INTEGER DEFAULT 0,  -- 答えられなかった
  offer_contact INTEGER DEFAULT 0,
  limited INTEGER DEFAULT 0      -- 上限で止めた（AIは呼んでいない）
);
CREATE INDEX messages_at ON messages(at);

-- 受け付けた問い合わせ。件名（どのサービスの話か）と日時だけ。名前・連絡先は入れない
CREATE TABLE IF NOT EXISTS contacts (
  id VARCHAR(36) PRIMARY KEY,    -- アプリが作る UUID
  at VARCHAR(32) NOT NULL,
  conv VARCHAR(40),
  topic TEXT
);
CREATE INDEX contacts_at ON contacts(at);
