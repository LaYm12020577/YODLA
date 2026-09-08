// schema-apply.js — применяет schema.sql к базе из POSTGRES_URL (локальный запуск).
const fs = require("path");
const { Client } = require("pg");

(async () => {
  const url = process.env.POSTGRES_URL;
  if (!url) { console.error("Задай POSTGRES_URL"); process.exit(1); }
  const c = new Client({ connectionString: url });
  await c.connect();
  await c.query(fs.readFileSync(__dirname + "/schema.sql", "utf8"));
  await c.end();
  console.log("✓ schema применена");
})();
