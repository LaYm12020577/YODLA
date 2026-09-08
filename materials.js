#!/usr/bin/env node
/**
 * materials.js — скачивает материалы разделов «Знаки» и «Штрафы» с yodla-app.uz
 *
 * Что делает:
 *   • Знаки:   картинки (.webp/.png) + описания (JSON + Markdown) по 8 категориям
 *   • Штрафы:  данные (JSON + Markdown) по 15 категориям
 *   • Структура папок повторяет сайт — для каждого из 3 языков (UZ/RU/OZ) своё дерево
 *
 * Структура:
 *   materials/
 *     Знаки/
 *       RU/ 01_Предупреждающие знаки/
 *             1.1_Железнодорожный переезд со шлагбаумом.webp
 *             ... _data.json (все описания категории)
 *             ... _README.md  (читаемый вид)
 *       UZ/ 01_Огоҳлантирувчи белгилар/ ...
 *       OZ/ 01_Ogohlantiruvchi belgilar/ ...
 *     Штрафы/
 *       RU/ 01_Оборудование безопасности/ _data.json + _README.md
 *       UZ/ ...   OZ/ ...
 *
 * Запуск:
 *   node materials.js --token "ВАШ_ТОКЕН"
 *   node materials.js --token "ВАШ_ТОКЕН" --signs     # только знаки
 *   node materials.js --token "ВАШ_ТОКЕН" --fines     # только штрафы
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { URL } = require("url");

const API_BASE = "https://api.yodla-app.uz/api";
const OUT_ROOT = path.join(__dirname, "materials");

// ── аргументы ──────────────────────────────────────────────────────────────
function parseArgs() {
  const a = { doSigns: true, doFines: true };
  for (let i = 2; i < process.argv.length; i++) {
    const v = process.argv[i];
    if (v === "--token") a.token = process.argv[++i];
    else if (v.startsWith("--token=")) a.token = v.slice(8);
    else if (v === "--signs") { a.doSigns = true; a.doFines = false; }
    else if (v === "--fines") { a.doSigns = false; a.doFines = true; }
  }
  if (!a.token && fs.existsSync(path.join(__dirname, "token.txt")))
    a.token = fs.readFileSync(path.join(__dirname, "token.txt"), "utf8").trim();
  return a;
}

// ── HTTP ────────────────────────────────────────────────────────────────────
function apiGet(p, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(API_BASE + p);
    const opts = { hostname: u.hostname, path: u.pathname + u.search, headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, timeout: 15000 };
    https.get(opts, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve({ status: res.statusCode, body: d }));
    }).on("error", reject);
  });
}

/** Скачать файл по URL. Повтор при обрывах. */
function downloadFile(urlStr, outPath, attempts = 5) {
  return new Promise((resolve, reject) => {
    const tryOnce = (n) => {
      if (n <= 0) return reject(new Error(`Не удалось скачать после всех попыток: ${urlStr}`));
      const u = new URL(urlStr);
      https.get({ hostname: u.hostname, path: u.pathname + u.search, headers: { "User-Agent": "Mozilla/5.0" }, timeout: 30000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return tryOnce(n - 1); // для редиректа упрощённо — повтор
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} для ${urlStr}`));
        }
        const ws = fs.createWriteStream(outPath);
        res.pipe(ws);
        ws.on("finish", () => ws.close(() => resolve()));
        ws.on("error", reject);
      }).on("error", (e) => {
        // сетевая ошибка — повтор через паузу
        setTimeout(() => tryOnce(n - 1), 3000);
      }).on("timeout", function () { this.destroy(new Error("timeout")); });
    };
    tryOnce(attempts);
  });
}

// ── утилиты ─────────────────────────────────────────────────────────────────
function sanitize(s) {
  return String(s).replace(/[<>:"/\\|?*\x00-\x1f]+/g, " ").replace(/\s+/g, " ").trim();
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Расширение файла из URL
function extFromUrl(urlStr, fallback = ".webp") {
  try {
    const u = new URL(urlStr);
    const m = u.pathname.match(/(\.[a-z0-9]+)$/i);
    return m ? m[1].toLowerCase() : fallback;
  } catch { return fallback; }
}

// Порядок категорий как на сайте (по id). Если порядок в API другой —
// используем стабильный человекочитаемый список.
const SIGN_CATEGORY_ORDER = [
  "ogohlantiruvchi", "imtiyoz", "majburiy", "buyuruvchi",
  "axborot", "qoshimcha_axborot", "xizmat", "vaqtinchalik",
];

const LANGS = [
  { code: "uz", label: "UZ", nameKey: "nameUz", descKey: "descriptionUz", addKey: "additionalPenaltyUz", violKey: "violationUz" },
  { code: "ru", label: "RU", nameKey: "nameRu", descKey: "descriptionRu", addKey: "additionalPenaltyRu", violKey: "violationRu" },
  { code: "oz", label: "OZ", nameKey: "nameOz", descKey: "descriptionOz", addKey: "additionalPenaltyOz", violKey: "violationOz" },
];

// ── ЗНАКИ ────────────────────────────────────────────────────────────────────
async function downloadSigns(token) {
  console.log("\n═══ ЗНАКИ ═══");
  const res = await apiGet("/traffic-signs", token);
  if (res.status !== 200) { console.error("Ошибка /traffic-signs:", res.status, res.body.slice(0, 200)); return; }
  const data = JSON.parse(res.body);
  const cats = data.categories;
  const signs = data.signs;
  console.log(`Категорий: ${cats.length} | Знаков: ${signs.length}`);

  // отсортировать категории по эталонному порядку
  const catById = new Map(cats.map((c) => [c.id, c]));
  const orderedCats = SIGN_CATEGORY_ORDER
    .map((id) => catById.get(id))
    .filter(Boolean);
  // добавить категории, которых нет в эталонном списке
  for (const c of cats) if (!orderedCats.includes(c)) orderedCats.push(c);

  // сгруппировать знаки по категориям
  const byCat = new Map();
  for (const s of signs) {
    if (!byCat.has(s.categoryId)) byCat.set(s.categoryId, []);
    byCat.get(s.categoryId).push(s);
  }
  // отсортировать знаки внутри категории по number
  for (const arr of byCat.values()) {
    arr.sort((a, b) => {
      const na = String(a.number).split(".").map((x) => x.padStart(6, "0")).join(".");
      const nb = String(b.number).split(".").map((x) => x.padStart(6, "0")).join(".");
      return na.localeCompare(nb);
    });
  }

  let imgOk = 0, imgFail = 0;
  const failList = [];

  for (let ci = 0; ci < orderedCats.length; ci++) {
    const cat = orderedCats[ci];
    const items = byCat.get(cat.id) || [];
    const num = String(ci + 1).padStart(2, "0");

    for (const lang of LANGS) {
      const catName = cat[lang.nameKey] || cat.nameUz || cat.id;
      const dir = path.join(OUT_ROOT, "Знаки", lang.label, `${num}_${sanitize(catName)}`);
      fs.mkdirSync(dir, { recursive: true });

      // ── JSON: все данные категории ──
      const jsonData = items.map((s) => ({
        number: s.number,
        description: s[lang.descKey] || s.descriptionUz || "",
        imageUrl: s.imageUrl,
        imageFile: s.imageUrl ? `${sanitize(s.number)}${extFromUrl(s.imageUrl)}` : null,
      }));
      fs.writeFileSync(path.join(dir, "_data.json"), JSON.stringify({ category: catName, count: items.length, signs: jsonData }, null, 2), "utf8");

      // ── Markdown: читаемый вид ──
      let md = `# ${catName}\n\nВсего знаков: ${items.length}\n\n`;
      for (const s of items) {
        const desc = s[lang.descKey] || s.descriptionUz || "(без описания)";
        const imgFile = s.imageUrl ? `${sanitize(s.number)}${extFromUrl(s.imageUrl)}` : null;
        md += `## ${s.number}\n\n`;
        if (imgFile) md += `![${s.number}](${imgFile.replace(/\s/g, "%20")})\n\n`;
        // описание может содержать \n — сохраняем
        md += `${desc.replace(/\n/g, "\n\n")}\n\n---\n\n`;
      }
      fs.writeFileSync(path.join(dir, "_README.md"), md, "utf8");
    }

    // Картинки скачиваем один раз (не зависят от языка). Кладём в RU-папку,
    // но и в UZ/OZ делаем копию-ссылку... нет — лучше скачать в каждую языковую
    // папку отдельно, чтобы каждое дерево было самодостаточным.
    // Для экономии: скачиваем в одну общую папку, а в языковых — копии.
    // Проще: скачиваем в каждую языковую папку (файлы маленькие ~4KB).
    console.log(`[${ci + 1}/${orderedCats.length}] ${cat.nameRu} (${items.length} знаков) — скачиваю картинки...`);
    for (const s of items) {
      if (!s.imageUrl) continue;
      for (const lang of LANGS) {
        const catName = cat[lang.nameKey] || cat.id;
        const dir = path.join(OUT_ROOT, "Знаки", lang.label, `${num}_${sanitize(catName)}`);
        const ext = extFromUrl(s.imageUrl);
        const imgPath = path.join(dir, `${sanitize(s.number)}${ext}`);
        if (fs.existsSync(imgPath)) continue; // уже скачано
        try {
          await downloadFile(s.imageUrl, imgPath);
          imgOk++;
        } catch (e) {
          imgFail++;
          failList.push(`${s.number} (${cat.nameRu}): ${e.message}`);
        }
      }
    }
  }

  console.log(`\nКартинки знаков: скачано ${imgOk}, ошибок ${imgFail}`);
  if (failList.length) {
    console.log("Ошибки (первые 10):");
    failList.slice(0, 10).forEach((f) => console.log("  - " + f));
  }
}

// ── ШТРАФЫ ───────────────────────────────────────────────────────────────────
async function downloadFines(token) {
  console.log("\n═══ ШТРАФЫ ═══");
  const res = await apiGet("/fines", token);
  if (res.status !== 200) { console.error("Ошибка /fines:", res.status, res.body.slice(0, 200)); return; }
  const data = JSON.parse(res.body);
  const cats = data.categories;
  const fines = data.fines;
  console.log(`Категорий: ${cats.length} | Штрафов: ${fines.length}`);

  // порядок категорий — как пришёл из API (по createdAt)
  const orderedCats = [...cats].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  const byCat = new Map();
  for (const f of fines) {
    if (!byCat.has(f.categoryId)) byCat.set(f.categoryId, []);
    byCat.get(f.categoryId).push(f);
  }
  for (const arr of byCat.values()) {
    arr.sort((a, b) => (a.article - b.article) || ((a.subArticle || 0) - (b.subArticle || 0)) || (a.id - b.id));
  }

  for (let ci = 0; ci < orderedCats.length; ci++) {
    const cat = orderedCats[ci];
    const items = byCat.get(cat.id) || [];
    const num = String(ci + 1).padStart(2, "0");

    for (const lang of LANGS) {
      const catName = cat[lang.nameKey] || cat.id;
      const dir = path.join(OUT_ROOT, "Штрафы", lang.label, `${num}_${sanitize(catName)}`);
      fs.mkdirSync(dir, { recursive: true });

      // ── JSON ──
      const jsonData = items.map((f) => ({
        article: f.article,
        subArticle: f.subArticle,
        violation: f[lang.violKey] || f.violationUz || "",
        fineBhm: f.fineBhm,
        fineUzs: f.fineUzs,
        penaltyPoints: f.penaltyPoints,
        additionalPenalty: f[lang.addKey] || null,
        repeatOffense: f.repeatOffense,
      }));
      fs.writeFileSync(path.join(dir, "_data.json"), JSON.stringify({ category: catName, count: items.length, fines: jsonData }, null, 2), "utf8");

      // ── Markdown ──
      let md = `# ${catName}\n\nВсего нарушений: ${items.length}\n\n`;
      md += `| Статья | Нарушение | Штраф (БЦМ) | Штраф (сум) | Баллы |\n`;
      md += `|--------|-----------|-------------|-------------|-------|\n`;
      for (const f of items) {
        const viol = (f[lang.violKey] || f.violationUz || "").replace(/\|/g, "/").replace(/\n/g, " ");
        const bhm = f.fineBhm || "—";
        const uzs = f.fineUzs ? parseInt(f.fineUzs).toLocaleString("ru-RU") + " сум" : "—";
        const pts = f.penaltyPoints && f.penaltyPoints !== "0.0" ? f.penaltyPoints : "—";
        const art = f.subArticle ? `${f.article}.${f.subArticle}` : `${f.article}`;
        md += `| ${art} | ${viol} | ${bhm} | ${uzs} | ${pts} |\n`;
      }
      md += `\n---\n\n`;
      // доп. сведения для нарушений с дополнительным наказанием
      for (const f of items) {
        const add = f[lang.addKey];
        if (add) {
          const art = f.subArticle ? `${f.article}.${f.subArticle}` : `${f.article}`;
          md += `- **${art}**: доп. наказание — ${add}\n`;
        }
      }
      fs.writeFileSync(path.join(dir, "_README.md"), md, "utf8");
    }
    console.log(`[${ci + 1}/${orderedCats.length}] ${cat.nameRu} (${items.length} нарушений)`);
  }
}

// ── main ───────────────────────────────────────────────────────────────────
(async () => {
  const args = parseArgs();
  if (!args.token) {
    console.error('Токен не передан. Использование: node materials.js --token "ВАШ_ТОКЕН"');
    process.exit(1);
  }
  fs.mkdirSync(OUT_ROOT, { recursive: true });

  console.log(`Папка материалов: ${OUT_ROOT}`);

  try {
    if (args.doSigns) await downloadSigns(args.token);
  } catch (e) { console.error("Ошибка при загрузке знаков:", e.message); }

  try {
    if (args.doFines) await downloadFines(args.token);
  } catch (e) { console.error("Ошибка при загрузке штрафов:", e.message); }

  console.log("\n═══ ГОТОВО ═══");
  console.log(`Папка: ${OUT_ROOT}`);
})();
