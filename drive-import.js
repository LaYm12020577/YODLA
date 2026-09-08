// drive-import.js — сопоставляет ваши ссылки Google Drive с видео-уроками.
//
// Как пользоваться:
//   1. Открой папку с видео на Google Drive, выдели все файлы → правый клик →
//      "Скопировать ссылки" (или открой каждый файл и скопируй URL из адресной строки).
//   2. Вставь все ссылки в файл drive-links.txt (каждая на новой строке).
//   3. Запусти:  node drive-import.js
//      Скрипт сопоставит имена файлов Drive с нашими уроками (по названию)
//      и создаст site/data/drive-map.json.
//
// После этого сайт будет брать видео напрямую с Google Drive (через прокси).

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const LINKS_FILE = path.join(ROOT, "drive-links.txt");
const MANIFEST = path.join(ROOT, "manifest.json");
const OUT = path.join(ROOT, "site", "data", "drive-map.json");

// ── достать FILE_ID и имя файла из ссылки/текста Drive ────────────
function parseLine(line) {
  line = line.trim();
  if (!line) return null;

  // Формат 1: https://drive.google.com/file/d/FILE_ID/view?usp=sharing
  let m = line.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return { fileId: m[1], name: null };

  // Формат 2: https://drive.google.com/open?id=FILE_ID
  m = line.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (m) return { fileId: m[1], name: null };

  // Формат 3: просто ID
  if (/^[a-zA-Z0-9_-]{25,}$/.test(line)) return { fileId: line, name: null };

  // Формат 4: "Имя файла https://..." или "Имя — ID" (экспорт из Drive)
  m = line.match(/^(.+?)\s+(?:https?:\/\/\S+|([a-zA-Z0-9_-]{25,}))\s*$/);
  if (m) {
    const id2 = line.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/) ||
                line.match(/([a-zA-Z0-9_-]{28,})/);
    if (id2) return { fileId: id2[1], name: m[1].trim() };
  }
  return null;
}

// ── получить метаданные файла (имя) через публичный эндпоинт ──────
function fetchFileName(fileId) {
  return new Promise((resolve) => {
    const https = require("https");
    // Публичная страница файла содержит <title>ИМЯ - Google Диск</title>
    https.get({ hostname: "drive.google.com", path: `/file/d/${fileId}/view`, headers: { "User-Agent": "Mozilla/5.0" }, timeout: 10000 }, (res) => {
      let d = "";
      res.on("data", (c) => { d += c; if (d.length > 200000) res.destroy(); });
      res.on("end", () => {
        const m = d.match(/<title>(.+?)(?:\s*-\s*Google Drive|\s*-\s*Google Диск)?<\/title>/i);
        resolve(m ? decodeEntities(m[1]) : null);
      });
      res.on("error", () => resolve(null));
    }).on("error", () => resolve(null))
      .on("timeout", function () { this.destroy(); resolve(null); });
  });
}
function decodeEntities(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
}

// ── нормализация имён для сопоставления ────────────────────────────
function norm(s) {
  return String(s).toLowerCase()
    .replace(/\.mp4$|\.webm$|\.mkv$/i, "")
    .replace(/[ёй]/g, (c) => ({ "ё": "е", "й": "и" }[c]))
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
// найти best match урока по имени файла
function matchLesson(fileName, lessons) {
  const fn = norm(fileName);
  if (!fn) return null;
  let best = null, bestScore = 0;
  for (const l of lessons) {
    const lt = norm(l.title);
    if (!lt) continue;
    // точное вхождение
    if (fn === lt || lt.includes(fn) || fn.includes(lt)) return l;
    // оценка по общим словам
    const fw = fn.split(" ").filter(w => w.length > 2);
    const tw = lt.split(" ").filter(w => w.length > 2);
    if (!fw.length || !tw.length) continue;
    const shared = fw.filter(w => tw.includes(w)).length;
    const score = shared / Math.max(fw.length, tw.length);
    if (score > bestScore) { bestScore = score; best = l; }
  }
  return bestScore >= 0.5 ? best : null;
}

(async () => {
  if (!fs.existsSync(LINKS_FILE)) {
    console.log("Создаю шаблон drive-links.txt — вставь в него свои ссылки и запусти снова.");
    fs.writeFileSync(LINKS_FILE, [
      "// Вставь сюда ссылки на видео из Google Drive, каждая с новой строки.",
      "// Поддерживаемые форматы:",
      "//   https://drive.google.com/file/d/FILE_ID/view?usp=sharing",
      "//   https://drive.google.com/open?id=FILE_ID",
      "//   FILE_ID",
      "//   Имя файла https://drive.google.com/file/d/FILE_ID/view",
      "",
    ].join("\n"), "utf8");
    process.exit(0);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const lessons = manifest.records || [];

  // парсим строки
  const raw = fs.readFileSync(LINKS_FILE, "utf8").split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("//"));
  const entries = raw.map(parseLine).filter(Boolean);
  console.log(`Ссылок найдено: ${entries.length} (из ${raw.length} строк)`);

  // для записей без имени — подтянуть имя с Drive
  for (const e of entries) {
    if (!e.name) {
      process.stdout.write(`  · ${e.fileId.slice(0, 12)}… — получаю имя… `);
      e.name = await fetchFileName(e.fileId);
      console.log(e.name ? `"${e.name}"` : "(не удалось, будет сопоставлен по порядку)");
    }
  }

  // сопоставляем с уроками
  const map = {};          // index -> fileId
  const usedLessons = new Set();
  const unmatched = [];
  for (const e of entries) {
    const lesson = e.name ? matchLesson(e.name, lessons.filter(l => !usedLessons.has(l.index))) : null;
    if (lesson) {
      map[String(lesson.index)] = e.fileId;
      usedLessons.add(lesson.index);
      console.log(`  ✓ Видео ${lesson.index} (${lesson.title.slice(0, 40)}) ← ${e.fileId.slice(0, 12)}…`);
    } else {
      unmatched.push(e);
    }
  }
  // несопоставленные — по порядку на оставшиеся уроки
  if (unmatched.length) {
    const rest = lessons.filter(l => !usedLessons.has(l.index));
    unmatched.forEach((e, i) => {
      if (rest[i]) {
        map[String(rest[i].index)] = e.fileId;
        usedLessons.add(rest[i].index);
        console.log(`  ~ Видео ${rest[i].index} ← ${e.fileId.slice(0, 12)}… (по порядку)`);
      }
    });
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), mapped: Object.keys(map).length, total: lessons.length, files: map }, null, 2), "utf8");
  console.log(`\n✓ drive-map.json создан: ${Object.keys(map).length}/${lessons.length} видео сопоставлены.`);
  if (Object.keys(map).length < lessons.length) {
    console.log("  Не всем урокам хватило ссылок — недостающие останутся локальными.");
  }
})();
