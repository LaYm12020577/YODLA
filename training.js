#!/usr/bin/env node
/**
 * training.js — выкачивает раздел «Тренировки» с yodla-app.uz
 *
 * Секции:
 *   ТРЕНИРОВКИ/
 *     ТЕМЫ/                    — 42 темы, каждая со своими вопросами
 *     БИЛЕТЫ/                  — 64 билета (Bilet 1..64), по 20 вопросов
 *     ЭКЗАМЕН/                 — образец экзаменационного билета (20 вопросов)
 *     МАРАФОН/                 — набор вопросов марафона
 *     КОВЕРЕЗНЫЕ ВОПРОСЫ/      — 219 коварных вопросов
 *
 * Каждый вопрос содержит: текст на 3 языках, варианты ответов (с пометкой
 * правильного), объяснение, картинку (если есть).
 *
 * Сохраняется в JSON (все данные) + Markdown (читаемый вид) + картинки.
 * Markdown генерируется на русском (основной язык), JSON содержит все 3 языка.
 *
 * Запуск:
 *   node training.js --token "ВАШ_ТОКЕН"
 *   node training.js --token "ВАШ_ТОКЕН" --themes        # только темы
 *   node training.js --token "ВАШ_ТОКЕН" --tickets        # только билеты
 *   node training.js --token "ВАШ_ТОКЕН" --tricky         # только коварные
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { URL } = require("url");

const API_BASE = "https://api.yodla-app.uz/api";
const OUT_ROOT = path.join(__dirname, "ТРЕНИРОВКИ");

// ── аргументы ──────────────────────────────────────────────────────────────
function parseArgs() {
  const a = { themes: true, tickets: true, exam: true, marathon: true, tricky: true };
  for (let i = 2; i < process.argv.length; i++) {
    const v = process.argv[i];
    if (v === "--token") a.token = process.argv[++i];
    else if (v.startsWith("--token=")) a.token = v.slice(8);
    else if (v === "--themes") { a.themes = true; a.tickets = a.exam = a.marathon = a.tricky = false; }
    else if (v === "--tickets") { a.tickets = true; a.themes = a.exam = a.marathon = a.tricky = false; }
    else if (v === "--exam") { a.exam = true; a.themes = a.tickets = a.marathon = a.tricky = false; }
    else if (v === "--marathon") { a.marathon = true; a.themes = a.tickets = a.exam = a.tricky = false; }
    else if (v === "--tricky") { a.tricky = true; a.themes = a.tickets = a.exam = a.marathon = false; }
  }
  if (!a.token && fs.existsSync(path.join(__dirname, "token.txt")))
    a.token = fs.readFileSync(path.join(__dirname, "token.txt"), "utf8").trim();
  return a;
}

// ── HTTP ────────────────────────────────────────────────────────────────────
function apiCall(p, method = "GET", body = null, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(API_BASE + p);
    const opts = {
      method, hostname: u.hostname, path: u.pathname + u.search,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
      timeout: 20000,
    };
    const req = https.request(opts, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve({ status: res.statusCode, body: d }));
    });
    req.on("timeout", () => req.destroy(new Error("Таймаут")));
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function downloadFile(urlStr, outPath, attempts = 4) {
  return new Promise((resolve, reject) => {
    const tryOnce = (n) => {
      if (n <= 0) return reject(new Error(`Не скачалось: ${urlStr}`));
      const u = new URL(urlStr);
      https.get({ hostname: u.hostname, path: u.pathname + u.search, headers: { "User-Agent": "Mozilla/5.0" }, timeout: 30000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return tryOnce(n - 1);
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
        const ws = fs.createWriteStream(outPath);
        res.pipe(ws);
        ws.on("finish", () => ws.close(resolve));
        ws.on("error", reject);
      }).on("error", () => setTimeout(() => tryOnce(n - 1), 2000))
        .on("timeout", function () { this.destroy(); });
    };
    tryOnce(attempts);
  });
}

// ── утилиты ─────────────────────────────────────────────────────────────────
function sanitize(s) { return String(s).replace(/[<>:"/\\|?*\x00-\x1f]+/g, " ").replace(/\s+/g, " ").trim(); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function extFromUrl(urlStr, fb = ".png") {
  try { const m = new URL(urlStr).pathname.match(/(\.[a-z0-9]+)$/i); return m ? m[1].toLowerCase() : fb; }
  catch { return fb; }
}

// Нормализовать вопрос в единую структуру (защита от разных форматов ответа)
function normalizeQuestion(q, idx) {
  const get = (obj, ...keys) => { for (const k of keys) if (obj && obj[k] != null && obj[k] !== "") return obj[k]; return ""; };
  return {
    id: q.id ?? idx + 1,
    questionUz: get(q, "questionTextUz", "questionUz"),
    questionRu: get(q, "questionTextRu", "questionRu"),
    questionOz: get(q, "questionTextOz", "questionOz"),
    explanationUz: get(q, "explanationUz"),
    explanationRu: get(q, "explanationRu"),
    explanationOz: get(q, "explanationOz"),
    imageUrl: q.imageUrl || null,
    hasVideo: q.hasVideoExplanation || !!q.videoUrl || false,
    options: (q.options || []).map((o) => ({
      id: o.id,
      textUz: get(o, "optionTextUz", "textUz"),
      textRu: get(o, "optionTextRu", "textRu"),
      textOz: get(o, "optionTextOz", "textOz"),
      isCorrect: !!o.isCorrect,
    })),
    correctOptionIds: (q.options || []).filter((o) => o.isCorrect).map((o) => o.id),
  };
}

// ── Markdown: один вопрос (русский основной) ──────────────────────────────────
function questionToMd(q, n, imgRel) {
  let md = `## Вопрос ${n}\n\n`;
  md += `**${q.questionRu || q.questionUz || q.questionOz}**\n\n`;
  if (imgRel) md += `![вопрос ${n}](${imgRel})\n\n`;
  q.options.forEach((o, i) => {
    const mark = o.isCorrect ? "✅" : "⬜";
    md += `${mark} ${String.fromCharCode(65 + i)}. ${o.textRu || o.textUz || o.textOz}\n`;
  });
  if (q.explanationRu || q.explanationUz) {
    md += `\n> 💡 ${q.explanationRu || q.explanationUz}\n`;
  }
  md += `\n---\n\n`;
  return md;
}

// Сохранить набор вопросов в папку (JSON + Markdown + картинки)
async function saveQuestions(dir, title, questions, { downloadImgs = true } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const norm = questions.map((q, i) => normalizeQuestion(q, i));

  // JSON — все 3 языка, полные данные
  fs.writeFileSync(path.join(dir, "_data.json"), JSON.stringify({ title, count: norm.length, questions: norm }, null, 2), "utf8");

  // Markdown — читаемый вид (RU основной)
  let md = `# ${title}\n\nВсего вопросов: ${norm.length}\n\n`;
  for (let i = 0; i < norm.length; i++) {
    const q = norm[i];
    let imgRel = null;
    if (downloadImgs && q.imageUrl) {
      const ext = extFromUrl(q.imageUrl);
      const imgName = `q${String(i + 1).padStart(2, "0")}${ext}`;
      try {
        await downloadFile(q.imageUrl, path.join(dir, imgName));
        imgRel = imgName;
      } catch (e) { /* пропустить картинку */ }
    }
    md += questionToMd(q, i + 1, imgRel);
  }
  fs.writeFileSync(path.join(dir, "_README.md"), md, "utf8");
  return norm.length;
}

// ── СЕКЦИЯ: ТЕМЫ ──────────────────────────────────────────────────────────────
async function downloadThemes(token) {
  console.log("\n═══ ТЕМЫ ═══");
  const res = await apiCall("/questions/themes", "GET", null, token);
  if (res.status !== 200) { console.error("Ошибка:", res.status, res.body.slice(0, 200)); return 0; }
  const themes = JSON.parse(res.body);
  console.log(`Тем: ${themes.length}`);
  let totalQ = 0;
  for (let i = 0; i < themes.length; i++) {
    const t = themes[i];
    const num = String(t.sortOrder || i + 1).padStart(2, "0");
    const name = t.nameRu || t.nameUz || t.nameOz || `theme${t.id}`;
    const dir = path.join(OUT_ROOT, "ТЕМЫ", `${num}_${sanitize(name)}`);
    // Пропуск если уже есть
    if (fs.existsSync(path.join(dir, "_data.json"))) {
      const existing = JSON.parse(fs.readFileSync(path.join(dir, "_data.json"), "utf8"));
      totalQ += existing.count;
      console.log(`  [${i + 1}/${themes.length}] ${name} — уже скачано (${existing.count} вопр.)`);
      continue;
    }
    const qres = await apiCall(`/questions/theme/${t.id}`, "GET", null, token);
    if (qres.status !== 200) { console.log(`  [${i + 1}] ${name} — ОШИБКА ${qres.status}`); await sleep(500); continue; }
    const qdata = JSON.parse(qres.body);
    const arr = Array.isArray(qdata) ? qdata : (qdata.questions || qdata.data || []);
    const n = await saveQuestions(dir, `${num}. ${name} (боб ${t.bob || "?"})`, arr);
    totalQ += n;
    console.log(`  [${i + 1}/${themes.length}] ${name} — ${n} вопросов ✓`);
    await sleep(300);
  }
  console.log(`Темы: всего ${totalQ} вопросов`);
  return totalQ;
}

// ── СЕКЦИЯ: БИЛЕТЫ ────────────────────────────────────────────────────────────
async function downloadTickets(token) {
  console.log("\n═══ БИЛЕТЫ ═══");
  const res = await apiCall("/tickets", "GET", null, token);
  if (res.status !== 200) { console.error("Ошибка:", res.status); return 0; }
  const data = JSON.parse(res.body);
  const tickets = data.tickets || data;
  console.log(`Билетов: ${tickets.length}`);
  let totalQ = 0, failed = 0;
  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    const num = String(t.ticketNumber).padStart(2, "0");
    const dir = path.join(OUT_ROOT, "БИЛЕТЫ", `Bilet_${num}`);
    if (fs.existsSync(path.join(dir, "_data.json"))) {
      const existing = JSON.parse(fs.readFileSync(path.join(dir, "_data.json"), "utf8"));
      totalQ += existing.count;
      console.log(`  [${i + 1}/${tickets.length}] Bilet ${t.ticketNumber} — уже скачано`);
      continue;
    }
    const proTag = t.isProOnly ? " (PRO)" : "";
    const sres = await apiCall(`/tickets/${t.ticketNumber}/start`, "POST", null, token);
    if (sres.status >= 400) {
      console.log(`  [${i + 1}] Bilet ${t.ticketNumber}${proTag} — ОШИБКА ${sres.status} ${sres.body.slice(0, 80)}`);
      failed++; await sleep(500); continue;
    }
    const sdata = JSON.parse(sres.body);
    const arr = sdata.questions || [];
    const n = await saveQuestions(dir, `Bilet ${t.ticketNumber}${proTag}`, arr);
    totalQ += n;
    console.log(`  [${i + 1}/${tickets.length}] Bilet ${t.ticketNumber}${proTag} — ${n} вопросов ✓`);
    await sleep(300);
  }
  console.log(`Билеты: всего ${totalQ} вопросов, ошибок ${failed}`);
  return totalQ;
}

// ── СЕКЦИЯ: ЭКЗАМЕН ───────────────────────────────────────────────────────────
async function downloadExam(token) {
  console.log("\n═══ ЭКЗАМЕН ═══");
  let totalQ = 0;
  // Сохраняем по 3 языкам — для каждого запускаем отдельный экзамен
  for (const [label, locale] of [["RU", "ru"], ["UZ", "uz"], ["OZ", "oz"]]) {
    const dir = path.join(OUT_ROOT, "ЭКЗАМЕН", `образец_${label}`);
    if (fs.existsSync(path.join(dir, "_data.json"))) {
      console.log(`  ${label} — уже скачано`);
      continue;
    }
    const res = await apiCall("/exams/start", "POST", { locale }, token);
    if (res.status >= 400) { console.log(`  ${label} — ОШИБКА ${res.status} ${res.body.slice(0, 100)}`); continue; }
    const data = JSON.parse(res.body);
    const arr = data.questions || [];
    const n = await saveQuestions(dir, `Экзамен (${label}) — образец`, arr);
    totalQ += n;
    console.log(`  ${label} — ${n} вопросов ✓`);
    await sleep(400);
  }
  return totalQ;
}

// ── СЕКЦИЯ: МАРАФОН ───────────────────────────────────────────────────────────
async function downloadMarathon(token) {
  console.log("\n═══ МАРАФОН ═══");
  const dir = path.join(OUT_ROOT, "МАРАФОН");
  if (fs.existsSync(path.join(dir, "_data.json"))) {
    console.log("  — уже скачано");
    return JSON.parse(fs.readFileSync(path.join(dir, "_data.json"), "utf8")).count;
  }
  const res = await apiCall("/questions/sessions/marathon/start", "POST", null, token);
  if (res.status >= 400) { console.log("  ОШИБКА", res.status, res.body.slice(0, 150)); return 0; }
  const data = JSON.parse(res.body);
  let arr = data.questions || [];
  // Марафон может отдавать батчами; пытаемся добрать через next-batch
  const sessionId = data.sessionId || data.id;
  let batch = 1;
  while (sessionId && data.hasMore && batch < 50) {
    await sleep(300);
    const nr = await apiCall(`/questions/sessions/${sessionId}/next-batch`, "GET", null, token);
    if (nr.status >= 400) break;
    const nd = JSON.parse(nr.body);
    if (nd.questions && nd.questions.length) arr = arr.concat(nd.questions);
    if (!nd.hasMore) break;
    batch++;
  }
  const n = await saveQuestions(dir, `Марафон`, arr);
  console.log(`  ${n} вопросов ✓`);
  return n;
}

// ── СЕКЦИЯ: КОВЕРЕЗНЫЕ ВОПРОСЫ ─────────────────────────────────────────────────
async function downloadTricky(token) {
  console.log("\n═══ КОВЕРЕЗНЫЕ ВОПРОСЫ ═══");
  const dir = path.join(OUT_ROOT, "КОВЕРЕЗНЫЕ ВОПРОСЫ");
  if (fs.existsSync(path.join(dir, "_data.json"))) {
    console.log("  — уже скачано");
    return JSON.parse(fs.readFileSync(path.join(dir, "_data.json"), "utf8")).count;
  }
  const res = await apiCall("/questions/tricky", "GET", null, token);
  if (res.status !== 200) { console.log("  ОШИБКА", res.status); return 0; }
  const arr = JSON.parse(res.body);
  const n = await saveQuestions(dir, `Коварные вопросы`, arr);
  console.log(`  ${n} вопросов ✓`);
  return n;
}

// ── main ───────────────────────────────────────────────────────────────────
(async () => {
  const args = parseArgs();
  if (!args.token) {
    console.error('Токен не передан. Использование: node training.js --token "ВАШ_ТОКЕН"');
    process.exit(1);
  }
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  console.log(`Папка: ${OUT_ROOT}`);

  const stats = {};
  try { if (args.themes) stats.themes = await downloadThemes(args.token); } catch (e) { console.error("Темы:", e.message); }
  try { if (args.tickets) stats.tickets = await downloadTickets(args.token); } catch (e) { console.error("Билеты:", e.message); }
  try { if (args.tricky) stats.tricky = await downloadTricky(args.token); } catch (e) { console.error("Коварные:", e.message); }
  try { if (args.marathon) stats.marathon = await downloadMarathon(args.token); } catch (e) { console.error("Марафон:", e.message); }
  try { if (args.exam) stats.exam = await downloadExam(args.token); } catch (e) { console.error("Экзамен:", e.message); }

  console.log("\n═══ ИТОГ ═══");
  console.log(`Папка: ${OUT_ROOT}`);
  for (const [k, v] of Object.entries(stats)) console.log(`  ${k}: ${v} вопросов`);
})();
