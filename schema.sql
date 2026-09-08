-- schema.sql — Vercel Postgres: пользователи и сессии Yodla.
-- Выполнить один раз (Vercel Dashboard → Storage → Postgres → Query;
-- или локально: npx @vercel/postgres psql < schema.sql при заданной POSTGRES_URL)

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  yodla_id    TEXT,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  phone       TEXT,
  exam_date   TEXT,
  title       TEXT NOT NULL DEFAULT 'Новичок',
  language    TEXT NOT NULL DEFAULT 'ru',
  dark_mode   BOOLEAN NOT NULL DEFAULT FALSE,
  pass_salt   TEXT NOT NULL,
  pass_hash   TEXT NOT NULL,
  stats       JSONB  NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Миграция существующих локальных users.json/sessions.json:
-- на Vercel файловая система read-only, поэтому старые JSON-аккаунты нужно
-- перенести в базу. Сделай это локально (см. migrate-to-pg.js), до деплоя.
