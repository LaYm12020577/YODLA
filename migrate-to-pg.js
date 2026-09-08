// migrate-to-pg.js — переносит data/users.json в Vercel Postgres.
// Локальный скрипт (НЕ деплоится). Запуск:
//   1) В Vercel создай Postgres (Storage → Create Database → Postgres)
//   2) Скопируй .env: POSTGRES_URL=postgres://... (полная строка с pulsedb или db.vercel.com)
//   3) npm i -D pg
//   4) node schema-apply.js   (создаст таблицы)
//   5) node migrate-to-pg.js  (перенесёт юзеров; сессии не переносятся — юзеры просто перелогинятся)

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

(async () => {
  const url = process.env.POSTGRES_URL;
  if (!url) { console.error("Задай POSTGRES_URL (строка из Vercel Storage → Postgres → .env)"); process.exit(1); }
  const users = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "users.json"), "utf8"));
  const c = new Client({ connectionString: url });
  await c.connect();

  let moved = 0, skipped = 0;
  for (const id in users) {
    const u = users[id];
    const dup = await c.query("SELECT 1 FROM users WHERE email=$1", [u.email]);
    if (dup.rowCount) { skipped++; continue; }
    await c.query(
      `INSERT INTO users (id, yodla_id, name, email, phone, exam_date, title, language, dark_mode, pass_salt, pass_hash, stats, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [u.id, u.yodlaId || null, u.name, u.email.toLowerCase(), u.phone || null, u.examDate || null,
       u.title || "Новичок", ["ru", "uz", "oz"].includes(u.language) ? u.language : "ru", !!u.darkMode,
       u.passSalt, u.passHash, JSON.stringify(u.stats || {}), u.createdAt || new Date().toISOString()]
    );
    moved++;
  }
  await c.end();
  console.log(`✓ Перенесено: ${moved}, пропущено (уже есть): ${skipped}`);
})();
