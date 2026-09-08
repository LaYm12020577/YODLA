// api/debug.js — диагностика подключения к базе. Открой /api/debug в браузере.
module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const out = {
    POSTGRES_URL_set: !!process.env.POSTGRES_URL,
    POSTGRES_URL_like: process.env.POSTGRES_URL ? process.env.POSTGRES_URL.slice(0, 22) + "…" : null,
  };
  if (!process.env.POSTGRES_URL) {
    out.problem = "НЕТ ПОДКЛЮЧЕНОЙ БАЗЫ: Vercel → твой проект → Storage → Create Database → Postgres (база должна быть привязана к проекту)";
    return res.status(500).json(out);
  }
  try {
    const { sql } = require("@vercel/postgres");
    const t = await sql`SELECT to_regclass('users') AS users, to_regclass('sessions') AS sessions`;
    out.users_table = t.rows[0].users;
    out.sessions_table = t.rows[0].sessions;
    if (!t.rows[0].users) {
      out.problem = "БАЗА ЕСТЬ, НО НЕТ ТАБЛИЦ. Открой Vercel → Storage → Postgres → Query и выполни содержимое schema.sql (из проекта)";
    } else {
      out.ok = true;
    }
  } catch (e) {
    out.problem = "Ошибка подключения к базе: " + e.message;
  }
  res.status(out.ok ? 200 : 500).json(out);
};
