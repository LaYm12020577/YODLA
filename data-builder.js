/**
 * data-builder.js - собирает все скачанные данные в JSON-файлы для сайта.
 *
 * Источники:
 *   manifest.json                       -> список видеоуроков
 *   materials/Знаки/(категории)/_data.json   -> знаки по категориям
 *   materials/Штрафы/(категории)/_data.json  -> штрафы по категориям
 *   ТРЕНИРОВКИ/ТЕМЫ/(тема)/_data.json        -> темы с вопросами
 *   ТРЕНИРОВКИ/БИЛЕТЫ/(билет)/_data.json     -> билеты
 *   ТРЕНИРОВКИ/КОВЕРЕЗНЫЕ ВОПРОСЫ/_data.json -> коварные вопросы
 *   ТРЕНИРОВКИ/МАРАФОН/_data.json            -> марафон
 *   ТРЕНИРОВКИ/ЭКЗАМЕН/(язык)/_data.json     -> экзамен
 *
 * Результат: site/data/(name).json
 */

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const OUT = path.join(__dirname, "site", "data");
fs.mkdirSync(OUT, { recursive: true });

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}
function writeJson(name, data) {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data), "utf8");
  console.log(`  ${name}: ${Array.isArray(data) ? data.length : Object.keys(data).length} записей`);
}

// ── ВИДЕО ────────────────────────────────────────────────────────────────────
function buildVideos() {
  console.log("\n— Видео —");
  const m = readJson(path.join(ROOT, "manifest.json"));
  if (!m) return console.log("  manifest.json не найден");
  const videos = (m.records || []).map((r) => ({
    index: r.index,
    lang: r.lang,
    title: r.title,
    file: r.outPath.replace(/^videos\//, "videos/"),
    size: r.expectedSize,
  }));
  writeJson("videos.json", videos);
}

// ── ЗНАКИ ──────────────────────────────────────────────────────────────────────
function buildSigns() {
  console.log("\n— Знаки —");
  const base = path.join(ROOT, "materials", "Знаки", "RU");
  if (!fs.existsSync(base)) return console.log("  папка Знаки/RU не найдена");
  const categories = [];
  for (const catDir of fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).sort()) {
    const data = readJson(path.join(base, catDir.name, "_data.json"));
    if (!data) continue;
    // картинки лежат рядом; путь относительно site/
    const imgBase = `../materials/Знаки/RU/${catDir.name}`;
    categories.push({
      category: data.category,
      count: data.count,
      signs: data.signs.map((s) => ({
        number: s.number,
        description: s.description,
        image: s.imageFile ? `${imgBase}/${s.imageFile}` : null,
      })),
    });
  }
  writeJson("signs.json", categories);
}

// ── ШТРАФЫ ─────────────────────────────────────────────────────────────────────
function buildFines() {
  console.log("\n— Штрафы —");
  const base = path.join(ROOT, "materials", "Штрафы", "RU");
  if (!fs.existsSync(base)) return console.log("  папка Штрафы/RU не найдена");
  const categories = [];
  for (const catDir of fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).sort()) {
    const data = readJson(path.join(base, catDir.name, "_data.json"));
    if (!data) continue;
    categories.push({
      category: data.category,
      count: data.count,
      fines: data.fines.map((f) => ({
        article: f.subArticle ? `${f.article}.${f.subArticle}` : `${f.article}`,
        violation: f.violation,
        fineBhm: f.fineBhm,
        fineUzs: f.fineUzs,
        penaltyPoints: f.penaltyPoints,
        additionalPenalty: f.additionalPenalty,
      })),
    });
  }
  writeJson("fines.json", categories);
}

// ── ТРЕНИРОВКИ ──────────────────────────────────────────────────────────────────
function buildTraining() {
  // ТЕМЫ
  console.log("\n— Темы —");
  const themesBase = path.join(ROOT, "ТРЕНИРОВКИ", "ТЕМЫ");
  const themes = [];
  if (fs.existsSync(themesBase)) {
    for (const d of fs.readdirSync(themesBase, { withFileTypes: true }).filter((d) => d.isDirectory()).sort()) {
      const data = readJson(path.join(themesBase, d.name, "_data.json"));
      if (!data) continue;
      const imgBase = `../ТРЕНИРОВКИ/ТЕМЫ/${d.name}`;
      themes.push({
        name: data.title,
        count: data.count,
        questions: data.questions.map((q, i) => normQ(q, i, imgBase)),
      });
    }
  }
  writeJson("themes.json", themes);

  // БИЛЕТЫ
  console.log("\n— Билеты —");
  const ticketsBase = path.join(ROOT, "ТРЕНИРОВКИ", "БИЛЕТЫ");
  const tickets = [];
  if (fs.existsSync(ticketsBase)) {
    for (const d of fs.readdirSync(ticketsBase, { withFileTypes: true }).filter((d) => d.isDirectory()).sort()) {
      const data = readJson(path.join(ticketsBase, d.name, "_data.json"));
      if (!data) continue;
      const imgBase = `../ТРЕНИРОВКИ/БИЛЕТЫ/${d.name}`;
      tickets.push({
        name: data.title,
        count: data.count,
        questions: data.questions.map((q, i) => normQ(q, i, imgBase)),
      });
    }
  }
  writeJson("tickets.json", tickets);

  // КОВЕРЕЗНЫЕ
  console.log("\n— Коварные —");
  const trickyData = readJson(path.join(ROOT, "ТРЕНИРОВКИ", "КОВЕРЕЗНЫЕ ВОПРОСЫ", "_data.json"));
  if (trickyData) {
    const imgBase = `../ТРЕНИРОВКИ/КОВЕРЕЗНЫЕ ВОПРОСЫ`;
    writeJson("tricky.json", {
      name: trickyData.title,
      count: trickyData.count,
      questions: trickyData.questions.map((q, i) => normQ(q, i, imgBase)),
    });
  }

  // МАРАФОН
  console.log("\n— Марафон —");
  const maraData = readJson(path.join(ROOT, "ТРЕНИРОВКИ", "МАРАФОН", "_data.json"));
  if (maraData) {
    const imgBase = `../ТРЕНИРОВКИ/МАРАФОН`;
    writeJson("marathon.json", {
      name: maraData.title,
      count: maraData.count,
      questions: maraData.questions.map((q, i) => normQ(q, i, imgBase)),
    });
  }

  // ЭКЗАМЕН (RU)
  console.log("\n— Экзамен —");
  const examBase = path.join(ROOT, "ТРЕНИРОВКИ", "ЭКЗАМЕН", "образец_RU");
  const examData = readJson(path.join(examBase, "_data.json"));
  if (examData) {
    const imgBase = `../ТРЕНИРОВКИ/ЭКЗАМЕН/образец_RU`;
    writeJson("exam.json", {
      name: examData.title,
      count: examData.count,
      questions: examData.questions.map((q, i) => normQ(q, i, imgBase)),
    });
  }
}

// Нормализация вопроса (оставляем только нужное для сайта, пути картинок относительные)
function normQ(q, i, imgBase) {
  let img = null;
  // q.imageUrl — абсолютный URL; картинка уже скачана локально как qNN.ext
  if (imgBase && fs.existsSync(path.join(ROOT, imgBase.replace(/^\.\.\//, ""), `q${String(i + 1).padStart(2, "0")}.png`)))
    img = `${imgBase}/q${String(i + 1).padStart(2, "0")}.png`;
  else if (imgBase && fs.existsSync(path.join(ROOT, imgBase.replace(/^\.\.\//, ""), `q${String(i + 1).padStart(2, "0")}.webp`)))
    img = `${imgBase}/q${String(i + 1).padStart(2, "0")}.webp`;
  return {
    question: q.questionRu || q.questionUz || q.questionOz || "",
    options: (q.options || []).map((o) => ({ text: o.textRu || o.textUz || o.textOz || "", correct: !!o.isCorrect })),
    explanation: q.explanationRu || q.explanationUz || "",
    image: img,
  };
}

// ── запуск ──────────────────────────────────────────────────────────────────────
console.log("Сборка данных для сайта →", OUT);
buildVideos();
buildSigns();
buildFines();
buildTraining();
console.log("\n✓ Готово");
