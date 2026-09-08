#!/usr/bin/env node
/**
 * fetcher.js — устойчивый загрузчик видео Yodla по manifest.json
 *
 * Почему НЕ bash+curl на Windows:
 *   - bash/cygwin портит узбекские спецсимволы в именах (қ, ҳ, ў -> ?)
 *   - вызов node/stat/bc в цикле создаёт десятки процессов → fork crashes
 *   - curl-фоновые процессы «зависают» на файлах (Device busy)
 *
 * Этот загрузчик — один процесс Node.js:
 *   - корректные Unicode-имена файлов
 *   - проверка размера по manifest
 *   - автодокачка (HTTP Range) при обрывах
 *   - пропуск уже скачанных полностью
 *
 * Запуск:
 *   node fetcher.js            # скачать всё
 *   node fetcher.js UZ         # только узбекские
 *   node fetcher.js RU         # только русские
 *   node fetcher.js 50         # только видео №50
 *
 * Можно прервать (Ctrl+C) и запустить снова — продолжит с того же места.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { URL } = require("url");

const ROOT = __dirname;
const MANIFEST_PATH = path.join(ROOT, "manifest.json");

if (!fs.existsSync(MANIFEST_PATH)) {
  console.error("✗ Не найден manifest.json.");
  console.error('  Сначала создайте его: node scraper.js --manifest --token "ВАШ_ТОКЕН"');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const records = Array.isArray(manifest) ? manifest : (manifest.records || manifest.videos || []);

// Фильтр из аргументов командной строки
const arg = process.argv[2];
let todo = records;
if (arg) {
  if (/^\d+$/.test(arg)) {
    todo = records.filter((r) => String(r.index) === arg);
  } else {
    const up = arg.toUpperCase();
    todo = records.filter((r) => (r.lang || "").toUpperCase() === up);
  }
}

// ── HTTP GET с поддержкой Range и потоковой записью ────────────────────────
function download(urlStr, outPath, expectedSize, attempt) {
  return new Promise((resolve, reject) => {
    const have = fs.existsSync(outPath) ? fs.statSync(outPath).size : 0;

    const u = new URL(urlStr);
    const headers = { "User-Agent": "Mozilla/5.0", Accept: "*/*" };
    if (have > 0) headers.Range = `bytes=${have}-`;

    const opts = {
      method: "GET",
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      headers,
      timeout: 60000, // таймаут на бездействие; скачивание идёт дольше
    };

    const req = https.request(opts, (res) => {
      // Редирект
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, urlStr).href;
        res.resume();
        return resolve(download(next, outPath, expectedSize, attempt));
      }
      // 416 Range Not Satisfiable → файл уже целиком
      if (res.statusCode === 416) {
        res.resume();
        return resolve({ skipped: true, bytes: have });
      }
      if (res.statusCode !== 200 && res.statusCode !== 206) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const append = res.statusCode === 206 && have > 0;
      const fileStream = fs.createWriteStream(outPath, append ? { flags: "a" } : { flags: "w" });

      // Общий размер (для прогресса).
      // При 206 (partial): content-range ".../TOTAL" даёт истинный общий размер.
      // При 200 (полный ответ, сервер проигнорировал Range): content-length сам по себе
      // полный размер, НЕ прибавляем have (файл перезаписывается с нуля).
      const total =
        res.statusCode === 206 && res.headers["content-range"]
          ? parseInt(res.headers["content-range"].split("/")[1], 10)
          : res.headers["content-length"]
          ? parseInt(res.headers["content-length"], 10)
          : null;

      let received = have;
      let lastReport = Date.now();
      let lastReceived = received;
      res.on("data", (chunk) => {
        received += chunk.length;
        const now = Date.now();
        if (now - lastReport >= 1000) {
          const deltaMB = (received - lastReceived) / 1048576;
          const speed = (deltaMB / ((now - lastReport) / 1000)).toFixed(1);
          const pct = total ? ((received / total) * 100).toFixed(1) : "?";
          const recvMB = (received / 1048576).toFixed(0);
          const totalMB = total ? (total / 1048576).toFixed(0) : "?";
          process.stdout.write(`\r   ↓ ${pct}% (${recvMB}/${totalMB} MB, ${speed} MB/s)   `);
          lastReport = now;
          lastReceived = received;
        }
      });

      res.pipe(fileStream);
      fileStream.on("finish", () => {
        fileStream.close(() => {
          process.stdout.write("\r");
          resolve({ bytes: received });
        });
      });
      fileStream.on("error", reject);
    });

    req.on("timeout", () => req.destroy(new Error("Таймаут соединения")));
    req.on("error", reject);
    req.end();
  });
}

// ── Главная ────────────────────────────────────────────────────────────────
(async () => {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Yodla загрузчик видео — записей к загрузке: ${todo.length}`);
  if (arg) console.log(`  Фильтр: ${arg}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  let ok = 0, skipped = 0, failed = 0;
  const failedList = [];
  const totalExpected = todo.reduce((s, r) => s + (r.expectedSize || 0), 0);
  let doneBytes = 0;

  for (let i = 0; i < todo.length; i++) {
    const r = todo[i];
    const outPath = path.join(ROOT, r.outPath);
    const label = `[${r.index}/88] (${r.lang || "—"}) ${r.title}`;
    console.log(label);

    // Пропуск полностью скачанного
    if (fs.existsSync(outPath) && r.expectedSize > 0 && fs.statSync(outPath).size === r.expectedSize) {
      const mb = (fs.statSync(outPath).size / 1048576).toFixed(0);
      console.log(`  ✓ Уже скачан (${mb} MB), пропуск`);
      skipped++;
      doneBytes += r.expectedSize;
      continue;
    }

    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    // Повторные попытки с докачкой.
    // Для сетевых ошибок (DNS, обрыв соединения) ждём дольше — они часто
    // временные и восстанавливаются через 10-30 секунд.
    let success = false;
    const MAX_ATTEMPTS = 8;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !success; attempt++) {
      try {
        await download(r.url, outPath, r.expectedSize, attempt);
        const got = fs.existsSync(outPath) ? fs.statSync(outPath).size : 0;
        if (r.expectedSize > 0 && got !== r.expectedSize) {
          console.log(`  ⚠ Размер ${got} ≠ ${r.expectedSize}, повтор ${attempt}/${MAX_ATTEMPTS}...`);
          // Если файл больше ожидаемого — он повреждён (докачка поверх мусора).
          // Удаляем, чтобы следующая попытка скачала начисто.
          if (got > r.expectedSize) {
            console.log(`  ⚠ Файл повреждён (${got} > ${r.expectedSize}), удаляю для чистой закачки`);
            fs.unlinkSync(outPath);
          }
          await new Promise((res) => setTimeout(res, 3000));
          continue;
        }
        const mb = (got / 1048576).toFixed(0);
        console.log(`  ✓ Сохранено: ${path.basename(r.outPath)} (${mb} MB)`);
        success = true;
        doneBytes += got;
      } catch (e) {
        // Сетевые ошибки: DNS (ENOTFOUND), обрыв (ECONNRESET), таймаут — ждём дольше
        const isNetworkErr = /ENOTFOUND|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|Таймаут/.test(e.message);
        const waitMs = isNetworkErr ? 15000 : 3000;
        console.log(`  ⚠ Попытка ${attempt}/${MAX_ATTEMPTS}: ${e.message}${isNetworkErr ? " (сетевая, жду 15с)" : ""}`);
        await new Promise((res) => setTimeout(res, waitMs));
      }
    }

    if (success) ok++;
    else {
      failed++;
      failedList.push(r);
    }

    // Общий прогресс
    const pct = totalExpected ? ((doneBytes / totalExpected) * 100).toFixed(1) : "?";
    console.log(`  [Общий прогресс: ${pct}% — ${i + 1}/${todo.length} обработано]\n`);
  }

  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Готово. Скачано: ${ok} | Пропущено: ${skipped} | Ошибок: ${failed}`);
  console.log(`  Папка: videos/`);
  if (failedList.length) {
    console.log(`\n  Не удалось скачать (запустите ещё раз: node fetcher.js — докачает недостающие):`);
    failedList.forEach((r) => console.log(`    - [${r.index}] (${r.lang}) ${r.title}`));
  }
  console.log("═══════════════════════════════════════════════════════════════");
})().catch((e) => {
  console.error("Критическая ошибка:", e);
  process.exit(1);
});
