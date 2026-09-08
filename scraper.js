#!/usr/bin/env node
/**
 * Yodla видео-скраппер
 * ---------------------
 * Скачивает все видеоуроки с yodla-app.uz.
 *
 * Принцип работы (открыт через анализ сайта):
 *   1. Базовый API:  https://api.yodla-app.uz/api
 *   2. Список уроков:      GET /education-videos/lessons
 *   3. Прямая ссылка mp4:  GET /education-videos/lessons/{id}/play-url
 *   4. Авторизация: Bearer-токен из localStorage (ключ "yodla_token")
 *
 * Это надёжнее, чем вытаскивать src из <video> через DevTools:
 *   - один проход по всем урокам,
 *   - правильные имена файлов и порядок,
 *   - докачка при обрыве (resumable — см. флаг --resume).
 *
 * Запуск:
 *   node scraper.js --token "ВСТАВЬ_ТОКЕН_СЮДА"
 *
 * Если токен не передан, скрипт попытается прочитать его из
 * переменной окружения YODLA_TOKEN или из файла token.txt.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { URL } = require("url");

// ── Конфигурация ─────────────────────────────────────────────────────────────
const API_BASE = "https://api.yodla-app.uz/api";
const LESSONS_PATH = "/education-videos/lessons";
const playUrlPath = (id) => `/education-videos/lessons/${id}/play-url`;

const OUT_DIR = path.join(__dirname, "videos");
// Если у уроков есть несколько языков, они раскладываются по подпапкам
// (videos/UZ/, videos/RU/ ...). Видео с одним языком кладутся прямо в videos/.
function outDirForLang(lang) {
  if (!lang) return OUT_DIR;
  return path.join(OUT_DIR, lang.toUpperCase());
}
const CONCURRENCY = 1;        // качаем по одному — безопаснее для "одноразового" доступа
const HTTP_TIMEOUT = 15000;   // для API-запросов
const DOWNLOAD_TIMEOUT = 0;   // 0 = без таймаута при скачивании (видео могут быть большими)

// ── Получение токена ─────────────────────────────────────────────────────────
function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === "--token") { args.token = process.argv[++i]; }
    else if (a.startsWith("--token=")) { args.token = a.slice(8); }
    else if (a === "--resume") { args.resume = true; }
    else if (a === "--dry-run") { args.dryRun = true; }
    else if (a === "--help" || a === "-h") { args.help = true; }
    else if (a === "--manifest") { args.manifest = true; }
    else if (a === "--lang") { args.lang = process.argv[++i]; }
  }
  return args;
}

function getToken() {
  const args = parseArgs();
  if (args.token) return args.token.trim();
  if (process.env.YODLA_TOKEN) return process.env.YODLA_TOKEN.trim();
  const tokenFile = path.join(__dirname, "token.txt");
  if (fs.existsSync(tokenFile)) {
    return fs.readFileSync(tokenFile, "utf8").trim();
  }
  return null;
}

// ── HTTP-помощники (без внешних зависимостей) ─────────────────────────────────
function request(method, urlStr, { headers = {}, timeout = HTTP_TIMEOUT } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const opts = {
      method,
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      headers: { "User-Agent": "Mozilla/5.0", ...headers },
      timeout,
    };
    const req = https.request(opts, (res) => {
      // 3xx — следуем за редиректом
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, urlStr).href;
        res.resume(); // освободить
        return resolve(request(method, next, { headers, timeout }));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on("timeout", () => req.destroy(new Error("Таймаут запроса")));
    req.on("error", reject);
    req.end();
  });
}

function apiGet(p, token) {
  return request("GET", API_BASE + p, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
}

/** Скачать файл по прямому URL в outPath с поддержкой докачки (Range). */
function downloadFile(urlStr, outPath, { token } = {}) {
  return new Promise((resolve, reject) => {
    const existing = fs.existsSync(outPath) ? fs.statSync(outPath).size : 0;

    const u = new URL(urlStr);
    const reqHeaders = { "User-Agent": "Mozilla/5.0" };
    if (token) reqHeaders.Authorization = `Bearer ${token}`;
    if (existing > 0) reqHeaders.Range = `bytes=${existing}-`;

    const opts = {
      method: "GET",
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      headers: reqHeaders,
      timeout: DOWNLOAD_TIMEOUT,
    };

    const req = https.request(opts, (res) => {
      // Редирект
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = new URL(res.headers.location, urlStr).href;
        res.resume();
        return resolve(downloadFile(next, outPath, { token }));
      }

      // 416 Range Not Satisfiable — файл уже скачан целиком
      if (res.statusCode === 416) {
        res.resume();
        return resolve({ skipped: true, bytes: existing });
      }

      if (res.statusCode !== 200 && res.statusCode !== 206) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} при скачивании ${urlStr}`));
      }

      // Если сервер проигнорировал Range и вернул 200 — начинаем сначала
      const append = res.statusCode === 206 && existing > 0;
      const fileStream = fs.createWriteStream(outPath, append ? { flags: "a" } : { flags: "w" });

      let received = append ? existing : 0;
      const totalHeader = res.headers["content-range"]
        ? parseInt(res.headers["content-range"].split("/")[1], 10)
        : res.headers["content-length"]
        ? parseInt(res.headers["content-length"], 10)
        : null;

      res.on("data", (chunk) => {
        received += chunk.length;
        if (totalHeader) {
          const pct = ((received / totalHeader) * 100).toFixed(1);
          process.stdout.write(`\r   ↓ ${pct}% (${(received / 1048576).toFixed(1)} MB)   `);
        } else {
          process.stdout.write(`\r   ↓ ${(received / 1048576).toFixed(1)} MB   `);
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

    req.on("timeout", () => req.destroy(new Error("Таймаут скачивания")));
    req.on("error", reject);
    req.end();
  });
}

// ── Утилиты ──────────────────────────────────────────────────────────────────
function sanitize(name) {
  return String(name).replace(/[<>:"/\\|?*\x00-\x1f]+/g, " ").replace(/\s+/g, " ").trim();
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Извлечь массив уроков из ответа API (защита от разных форматов обёртки)
function extractLessons(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  for (const key of ["data", "lessons", "items", "results", "videos"]) {
    if (Array.isArray(data[key])) return data[key];
  }
  // Возможно, сгруппировано по категориям/модулям: { modules: [ {lessons:[...]} ] }
  for (const key of ["modules", "categories", "groups", "sections"]) {
    if (Array.isArray(data[key])) {
      const flat = [];
      for (const grp of data[key]) {
        if (Array.isArray(grp?.lessons)) flat.push(...grp.lessons);
        else if (grp && typeof grp === "object") flat.push(grp);
      }
      if (flat.length) return flat;
    }
  }
  return [];
}

// Найти URL видео в ответе play-url (защита от разных форматов)
function extractPlayUrl(data) {
  if (typeof data === "string") return data;
  if (!data || typeof data !== "object") return null;
  for (const key of ["data", "url", "playUrl", "play_url", "videoUrl", "video_url", "src", "link", "hls", "mp4"]) {
    const v = data[key];
    if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
    if (v && typeof v === "object") {
      const inner = extractPlayUrl(v);
      if (inner) return inner;
    }
  }
  // Иногда url лежит в { data: { url: "..." } } или массиве источников
  return null;
}

function pickLessonId(lesson) {
  if (!lesson || typeof lesson !== "object") return null;
  for (const k of ["id", "uuid", "_id", "lessonId", "videoId"]) {
    if (lesson[k] != null) return lesson[k];
  }
  return null;
}

function pickLessonTitle(lesson, idx) {
  if (!lesson || typeof lesson !== "object") return `lesson_${String(idx + 1).padStart(2, "0")}`;
  // Yodla хранит названия на 3 языках: titleUz / titleRu / titleOz.
  // Предпочитаем название, соответствующее языку самого урока.
  const lang = (lesson.language || "").toString().toLowerCase();
  const preferred = lang === "ru" ? "titleRu" : lang === "oz" ? "titleOz" : "titleUz";
  const order = [preferred, "titleUz", "titleRu", "titleOz", "title", "name", "lessonTitle", "label"];
  for (const k of order) {
    if (typeof lesson[k] === "string" && lesson[k].trim()) return lesson[k].trim();
  }
  return `lesson_${String(idx + 1).padStart(2, "0")}`;
}

function pickLessonLang(lesson) {
  const lang = (lesson.language || lesson.lang || "").toString().toLowerCase();
  return lang ? lang.toUpperCase() : "";
}

// Сортировка уроков: по sortOrder при наличии, иначе по id
function sortLessons(arr) {
  return [...arr].sort((a, b) => {
    const sa = a.sortOrder ?? 1e9;
    const sb = b.sortOrder ?? 1e9;
    if (sa !== sb) return sa - sb;
    return (a.id ?? 0) - (b.id ?? 0);
  });
}

// ── Основная логика ─────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(`Yodla видео-скраппер

Использование:
  node scraper.js --token "ВАШ_ТОКЕН" --manifest   # создать manifest.json (рекомендуется)
  bash download.sh                                  # скачать всё по manifest (надёжно, curl)
  bash download.sh UZ                              # только узбекские
  node scraper.js --token "ВАШ_ТОКЕН" --resume     # (запасной режим) качать через Node
  node scraper.js --dry-run --token "ВАШ_ТОКЕН"    # только показать список, не качать

Токен можно также положить в файл token.txt или задать YODLA_TOKEN.

Как получить токен (один раз, пока вы залогинены на yodla-app.uz):
  1. Откройте сайт и войдите через Telegram.
  2. Нажмите F12 (DevTools) → вкладка Console.
  3. Вставьте:  localStorage.getItem('yodla_token')
  4. Скопируйте возвращённую строку (с кавычками или без).
`);
    return;
  }

  const token = getToken();
  if (!token) {
    console.error("✗ Токен не найден.");
    console.error("  Передайте его: node scraper.js --token \"...\"");
    console.error("  Или сохраните в файл token.txt");
    console.error("  Или задайте YODLA_TOKEN");
    console.error("  Подробности: node scraper.js --help");
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 1) Проверяем токен + получаем профиль (для отчёта)
  console.log("→ Проверка токена...");
  const meRes = await apiGet("/me/profile", token);
  if (meRes.status === 401 || meRes.status === 403) {
    console.error(`✗ Токен недействителен (HTTP ${meRes.status}).`);
    console.error("  Возможные причины: срок действия истёк или токен скопирован не полностью.");
    process.exit(1);
  }
  let profileName = null;
  try {
    const meJson = JSON.parse(meRes.body);
    profileName = meJson?.data?.name || meJson?.data?.full_name || meJson?.name || null;
  } catch (_) {}
  console.log(`  Токен принят. Профиль: ${profileName || "(без имени)"}`);

  // 2) Получаем список всех уроков
  console.log("→ Загрузка списка видеоуроков...");
  const lessonsRes = await apiGet(LESSONS_PATH, token);
  if (lessonsRes.status !== 200) {
    console.error(`✗ Не удалось получить список уроков (HTTP ${lessonsRes.status}).`);
    console.error(`  Ответ: ${lessonsRes.body.slice(0, 300)}`);
    process.exit(1);
  }

  let lessonsJson;
  try {
    lessonsJson = JSON.parse(lessonsRes.body);
  } catch (e) {
    console.error("✗ Сервер вернул некорректный JSON. Первые 300 символов:");
    console.error(lessonsRes.body.slice(0, 300));
    process.exit(1);
  }

  let lessons = extractLessons(lessonsJson);
  lessons = sortLessons(lessons);
  if (args.lang) {
    const l = args.lang.toLowerCase();
    lessons = lessons.filter((x) => {
      const lang = (x.language || x.lang || x.locale || "").toString().toLowerCase();
      return lang === l;
    });
    console.log(`  Фильтр по языку "${args.lang}": осталось ${lessons.length}.`);
  }

  if (!lessons.length) {
    console.log("✓ Уроки не найдены. Сохраняю сырой ответ для анализа в lessons_raw.json ...");
    fs.writeFileSync(path.join(__dirname, "lessons_raw.json"), JSON.stringify(lessonsJson, null, 2), "utf8");
    console.log('  Откройте lessons_raw.json и сообщите структуру — скрипт адаптируется.');
    return;
  }

  console.log(`✓ Найдено уроков: ${lessons.length}\n`);
  lessons.forEach((l, i) => {
    const id = pickLessonId(l);
    const title = pickLessonTitle(l, i);
    const lang = pickLessonLang(l);
    console.log(`  ${String(i + 1).padStart(3)}. [${id}]${lang ? ` (${lang})` : ""} ${title}`);
  });
  console.log("");

  if (args.dryRun) {
    console.log("--dry-run: скачивание пропущено.");
    fs.writeFileSync(path.join(__dirname, "lessons_raw.json"), JSON.stringify(lessonsJson, null, 2), "utf8");
    return;
  }

  // ── Режим --manifest: быстро собрать все URL + размеры в manifest.json,
  //    затем качать устойчивым download.sh (curl). Node-процесс в фоне
  //    может обрываться, поэтому тяжёлая загрузка вынесена из scraper.js.
  if (args.manifest) {
    console.log("→ Сбор manifest.json (запрос размеров через HEAD)...");
    const records = [];
    for (let i = 0; i < lessons.length; i++) {
      const lesson = lessons[i];
      const id = pickLessonId(lesson);
      const title = pickLessonTitle(lesson, i);
      const lang = pickLessonLang(lesson);
      const safeName = `${String(i + 1).padStart(2, "0")}_${sanitize(title)}`;
      const targetDir = outDirForLang(lang);
      const relDir = path.relative(__dirname, targetDir).split(path.sep).join("/");
      const outPathRel = `${relDir}/${safeName}.mp4`;
      let url = (typeof lesson.videoUrl === "string" && /^https?:\/\//.test(lesson.videoUrl))
        ? lesson.videoUrl : null;
      let expectedSize = 0;
      if (!url && id) {
        try {
          const playRes = await apiGet(playUrlPath(id), token);
          if (playRes.status === 200) {
            let pj; try { pj = JSON.parse(playRes.body); } catch (_) { pj = playRes.body; }
            url = extractPlayUrl(pj);
          }
        } catch (_) {}
      }
      if (url) {
        try {
          const h = await request("HEAD", url, { headers: { "User-Agent": "Mozilla/5.0" }, timeout: HTTP_TIMEOUT });
          if (h.status === 200 && h.headers["content-length"]) {
            expectedSize = parseInt(h.headers["content-length"], 10) || 0;
          }
        } catch (_) {}
      }
      records.push({
        index: i + 1, id, lang, title, url,
        expectedSize, outPath: outPathRel,
      });
      console.log(`  ${String(i + 1).padStart(2, "0")}. ${String((expectedSize / 1048576).toFixed(0)).padStart(4)} MB  ${lang || "—"}  ${title}`);
    }
    const manifest = { generatedAt: new Date().toISOString(), count: records.length, records };
    fs.writeFileSync(path.join(__dirname, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    const totalMB = records.reduce((s, r) => s + r.expectedSize, 0) / 1048576;
    console.log(`\n✓ manifest.json сохранён: ${records.length} записей, всего ~${totalMB.toFixed(0)} MB`);
    console.log('  Теперь запускайте: bash download.sh');
    return;
  }

  // 3) Скачиваем каждый урок
  let ok = 0, failed = 0, skipped = 0;
  const failedList = [];

  for (let i = 0; i < lessons.length; i++) {
    const lesson = lessons[i];
    const id = pickLessonId(lesson);
    const title = pickLessonTitle(lesson, i);
    const lang = pickLessonLang(lesson);
    // Нумерация в имени — сквозная; метка языка не нужна, т.к. он в названии папки.
    const safeName = `${String(i + 1).padStart(2, "0")}_${sanitize(title)}`;
    const targetDir = outDirForLang(lang);
    fs.mkdirSync(targetDir, { recursive: true });
    const outPath = path.join(targetDir, `${safeName}.mp4`);

    console.log(`\n[${i + 1}/${lessons.length}] ${title}`);

    // Пропуск уже скачанного (если --resume)
    if (args.resume && fs.existsSync(outPath) && fs.statSync(outPath).size > 1024) {
      console.log(`  ✓ Уже скачано (${(fs.statSync(outPath).size / 1048576).toFixed(1)} MB), пропуск.`);
      skipped++;
      continue;
    }

    if (!id) {
      console.log("  ✗ Не удалось определить ID урока — пропуск.");
      failed++; failedList.push({ title, reason: "no id" });
      continue;
    }

    // Определяем прямую ссылку на mp4.
    // Приоритет: videoUrl из списка (публичный, не истекает), затем play-url (подписанная ссылка).
    try {
      let videoUrl = null;
      if (typeof lesson.videoUrl === "string" && /^https?:\/\//.test(lesson.videoUrl)) {
        videoUrl = lesson.videoUrl;
      }
      if (!videoUrl) {
        const playRes = await apiGet(playUrlPath(id), token);
        if (playRes.status === 200) {
          let playJson;
          try { playJson = JSON.parse(playRes.body); } catch (_) { playJson = playRes.body; }
          videoUrl = extractPlayUrl(playJson);
        }
      }
      if (!videoUrl) {
        console.log(`  ✗ Не удалось получить ссылку на видео (ни videoUrl, ни play-url)`);
        failed++; failedList.push({ title, reason: "no video url" });
        continue;
      }
      console.log(`  Ссылка: ${videoUrl.slice(0, 90)}${videoUrl.length > 90 ? "..." : ""}`);

      await downloadFile(videoUrl, outPath, { token });
      const sizeMB = (fs.statSync(outPath).size / 1048576).toFixed(1);
      console.log(`  ✓ Сохранено: ${safeName}.mp4 (${sizeMB} MB)`);
      ok++;
    } catch (e) {
      console.log(`  ✗ Ошибка: ${e.message}`);
      failed++; failedList.push({ title, reason: e.message });
    }

    await sleep(400); // мягкая пауза между уроками
  }

  // 4) Итог
  console.log(`\n════════════════════════════════════════`);
  console.log(`Готово. Скачано: ${ok}, пропущено: ${skipped}, ошибок: ${failed}`);
  console.log(`Папка: ${OUT_DIR}`);
  if (failedList.length) {
    console.log(`\nНе удалось скачать:`);
    failedList.forEach((f) => console.log(`  - ${f.title} (${f.reason})`));
  }
}

main().catch((e) => {
  console.error("Критическая ошибка:", e);
  process.exit(1);
});
