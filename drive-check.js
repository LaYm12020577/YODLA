// drive-check.js — проверяет доступность всех видео на Google Drive.
//
// Использование:  node drive-check.js
//
// Для каждого файла из drive-map.json проверяет: отдаёт Drive видео
// (OK) или страницу входа/подтверждения (FAIL). В конце — сводка.

const https = require("https");
const fs = require("fs");
const path = require("path");

const MAP = JSON.parse(fs.readFileSync(path.join(__dirname, "site", "data", "drive-map.json"), "utf8")).files;

function checkFile(fileId) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: "drive.usercontent.google.com",
      path: `/download?id=${fileId}&export=download&confirm=t`,
      headers: { "User-Agent": "Mozilla/5.0", Range: "bytes=0-1024" },
      method: "GET",
      timeout: 12000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400) {
        res.resume();
        // редирект на accounts.google.com = доступ закрыт
        const loc = res.headers.location || "";
        return resolve(loc.includes("accounts.google.com") ? "AUTH" : "REDIR");
      }
      const ct = res.headers["content-type"] || "";
      let head = "";
      res.on("data", (c) => { head += c.toString("latin1"); });
      res.on("end", () => {
        if (ct.includes("text/html")) return resolve(head.includes("Sign in") ? "AUTH" : "CONFIRM");
        if (ct.includes("video") || ct.includes("binary") || ct.includes("octet")) return resolve("OK");
        resolve("UNKNOWN:" + ct);
      });
    });
    req.on("timeout", () => { req.destroy(); resolve("TIMEOUT"); });
    req.on("error", () => resolve("ERR"));
    req.end();
  });
}

(async () => {
  const ids = Object.keys(MAP);
  console.log(`Проверяю ${ids.length} файлов Google Drive...\n`);
  let ok = 0, auth = 0, other = 0;
  const bad = [];

  // проверяем параллельно по 8
  for (let i = 0; i < ids.length; i += 8) {
    const chunk = ids.slice(i, i + 8);
    const results = await Promise.all(chunk.map(async (k) => ({ k, r: await checkFile(MAP[k]) })));
    for (const { k, r } of results) {
      if (r === "OK") { ok++; process.stdout.write("✓"); }
      else { auth += r === "AUTH" ? 1 : 0; other += r === "AUTH" ? 0 : 1; bad.push(`  Видео ${k}: ${r}`); process.stdout.write(r === "AUTH" ? "✗" : "?"); }
    }
  }
  console.log("\n");
  console.log(`═══ ИТОГ ═══`);
  console.log(`  ✓ Доступны (видео стримится): ${ok}`);
  console.log(`  ✗ Требуют входа (закрыт доступ): ${auth}`);
  if (other) console.log(`  ? Другие проблемы: ${other}`);
  if (bad.length && bad.length <= 20) {
    console.log(`\nПроблемные:`);
    bad.forEach((b) => console.log(b));
  }
  if (auth > 0) {
    console.log(`\n💡 Как открыть доступ:`);
    console.log(`  1. Открой папку с видео на Google Drive`);
    console.log(`  2. Выдели все файлы (Ctrl+A) → правый клик → «Доступ» → «Открыть доступ»`);
    console.log(`  3. Внизу «Общий доступ» выбери «Все, у кого есть ссылка» → роль «Читатель»`);
    console.log(`  4. Нажми «Отправить/Готово», затем снова запусти: node drive-check.js`);
  }
})();
