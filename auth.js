// auth.js — система регистрации/входа с JSON-базой.
//
// Безопасность:
//   • Пароли хешируются PBKDF2 (node:crypto) + уникальная соль на юзера.
//   • Сессии — случайные токены (32 байта), хранятся в sessions.json.
//   • Пароли НИКОГДА не сохраняются в открытом виде.
//
// Файлы:
//   data/users.json    — { [id]: { id, name, email, passSalt, passHash, createdAt, ... } }
//   data/sessions.json — { [token]: { userId, createdAt, expiresAt } }

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "{}");
if (!fs.existsSync(SESSIONS_FILE)) fs.writeFileSync(SESSIONS_FILE, "{}");

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 дней

// ── чтение/запись JSON-баз ────────────────────────────────────────
function readDb(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return {}; }
}
function writeDb(file, data) {
  // атомарная запись через временный файл
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

// ── хеширование пароля (PBKDF2-SHA256, 100k итераций) ─────────────
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
}
function newSalt() {
  return crypto.randomBytes(16).toString("hex");
}
function newToken() {
  return crypto.randomBytes(32).toString("hex");
}

// ── валидация ─────────────────────────────────────────────────────
function validEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 120;
}
function validName(name) {
  return typeof name === "string" && name.trim().length >= 2 && name.trim().length <= 40;
}
function validPassword(password) {
  return typeof password === "string" && password.length >= 6 && password.length <= 100;
}

// ── API ───────────────────────────────────────────────────────────

/** Регистрация нового пользователя. Возвращает { user, token } или { error }. */
function register({ name, email, password }) {
  name = (name || "").trim();
  email = (email || "").trim().toLowerCase();

  if (!validName(name)) return { error: "Имя должно быть от 2 до 40 символов" };
  if (!validEmail(email)) return { error: "Некорректный email" };
  if (!validPassword(password)) return { error: "Пароль должен быть не короче 6 символов" };

  const users = readDb(USERS_FILE);
  // проверка уникальности email
  for (const id in users) {
    if (users[id].email === email) return { error: "Пользователь с таким email уже существует" };
  }

  const salt = newSalt();
  const hash = hashPassword(password, salt);
  const userId = "u_" + crypto.randomBytes(8).toString("hex");
  // Yodla ID — публичный короткий номер вида XXX-XXXX
  const yodlaId = Math.floor(100 + Math.random() * 900) + "-" + Math.floor(1000 + Math.random() * 9000);
  const user = {
    id: userId,
    yodlaId,
    name,
    email,
    phone: null,
    examDate: null,           // ISO дата экзамена (выбирает юзер)
    title: "Новичок",          // отображаемое звание
    language: "ru",           // ru | uz | oz
    darkMode: false,
    passSalt: salt,
    passHash: hash,
    createdAt: new Date().toISOString(),
    // Прогресс обучения — основа для AI-оценки готовности.
    stats: newStats(),
  };
  users[userId] = user;
  writeDb(USERS_FILE, users);

  const token = createSession(userId);
  return { user: publicUser(user), token };
}

/** Вход по email + пароль. Возвращает { user, token } или { error }. */
function login({ email, password }) {
  email = (email || "").trim().toLowerCase();
  if (!validEmail(email) || !password) return { error: "Введите email и пароль" };

  const users = readDb(USERS_FILE);
  let user = null;
  for (const id in users) {
    if (users[id].email === email) { user = users[id]; break; }
  }
  if (!user) return { error: "Пользователь не найден" };

  const hash = hashPassword(password, user.passSalt);
  if (hash !== user.passHash) return { error: "Неверный пароль" };

  const token = createSession(user.id);
  return { user: publicUser(user), token };
}

/** Создать сессию и вернуть токен. */
function createSession(userId) {
  const sessions = readDb(SESSIONS_FILE);
  // удалить старые сессии этого юзера (одна активная)
  for (const t in sessions) if (sessions[t].userId === userId) delete sessions[t];
  const token = newToken();
  sessions[token] = {
    userId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  };
  writeDb(SESSIONS_FILE, sessions);
  return token;
}

/** Проверить токен. Возвращает user или null. */
function getUserByToken(token) {
  if (!token) return null;
  const sessions = readDb(SESSIONS_FILE);
  const session = sessions[token];
  if (!session) return null;
  if (new Date(session.expiresAt) < new Date()) {
    delete sessions[token];
    writeDb(SESSIONS_FILE, sessions);
    return null;
  }
  const users = readDb(USERS_FILE);
  const user = users[session.userId];
  return user ? publicUser(user) : null;
}

/** Завершить сессию (выход). */
function logout(token) {
  if (!token) return;
  const sessions = readDb(SESSIONS_FILE);
  if (sessions[token]) {
    delete sessions[token];
    writeDb(SESSIONS_FILE, sessions);
  }
}

/** Публичные данные юзера (без соли/хеша). */
function publicUser(user) {
  const s = migrateStats(user);
  return {
    id: user.id,
    yodlaId: user.yodlaId || null,
    name: user.name,
    email: user.email,
    phone: user.phone || null,
    examDate: user.examDate || null,
    title: user.title || "Новичок",
    language: user.language || "ru",
    darkMode: !!user.darkMode,
    createdAt: user.createdAt,
    stats: s,
  };
}

/** Доступные звания (как на оригинале). */
const TITLES = [
  { id: "Новичок", label: "🌱 Новичок", minScore: 0 },
  { id: "Ученик", label: "📚 Ученик", minScore: 10 },
  { id: "Знаток", label: "💡 Знаток", minScore: 30 },
  { id: "Мастер", label: "⭐ Мастер", minScore: 50 },
  { id: "Профи", label: "🏆 Профи", minScore: 75 },
  { id: "Легенда", label: "👑 Легенда", minScore: 90 },
];
function getTitles() { return TITLES; }

/** Обновить поля профиля. */
function updateProfile(userId, patch) {
  const users = readDb(USERS_FILE);
  if (!users[userId]) return null;
  const u = users[userId];
  const allowed = ["name", "phone", "examDate", "title", "language", "darkMode"];
  for (const k of allowed) {
    if (k in patch) {
      if (k === "name") { const n = String(patch[k] || "").trim(); if (n.length >= 2) u.name = n; }
      else if (k === "darkMode") u.darkMode = !!patch[k];
      else if (k === "examDate") u.examDate = patch[k] || null;
      else if (k === "language" && ["ru", "uz", "oz"].includes(patch[k])) u.language = patch[k];
      else if (k === "title" && TITLES.some(t => t.id === patch[k])) u.title = patch[k];
      else if (k === "phone") u.phone = patch[k] ? String(patch[k]) : null;
    }
  }
  writeDb(USERS_FILE, users);
  return publicUser(u);
}

/** Сменить пароль (с проверкой старого). */
function changePassword(userId, oldPassword, newPassword) {
  const users = readDb(USERS_FILE);
  if (!users[userId]) return { error: "Пользователь не найден" };
  const u = users[userId];
  const oldHash = hashPassword(oldPassword, u.passSalt);
  if (oldHash !== u.passHash) return { error: "Неверный текущий пароль" };
  if (!validPassword(newPassword)) return { error: "Новый пароль должен быть не короче 6 символов" };
  const salt = newSalt();
  u.passSalt = salt;
  u.passHash = hashPassword(newPassword, salt);
  writeDb(USERS_FILE, users);
  return { ok: true };
}

/** Сохранить статистику юзера (например, после викторины). */
function updateStats(userId, patch) {
  const users = readDb(USERS_FILE);
  if (!users[userId]) return null;
  users[userId].stats = { ...(users[userId].stats || {}), ...patch };
  writeDb(USERS_FILE, users);
  return publicUser(users[userId]);
}

/** Свежий объект прогресса для нового пользователя. */
function newStats() {
  return {
    // множества пройденного (массивы ID для уникальности)
    videosWatched: [],      // ID просмотренных видео (index)
    themesDone: [],         // ID пройденных тем
    ticketsDone: [],        // номера пройденных билетов
    trickyMastered: [],     // ID коварных вопросов, отвеченных верно
    examsPassed: 0,         // кол-во сданных экзаменов (>=80%)
    // позиции просмотра видео: { [videoIndex]: positionSeconds }
    videoPositions: {},
    // сводные счётчики
    quizzesTaken: 0,
    correctAnswers: 0,
    totalAnswers: 0,
  };
}

/** Нормализовать старый формат stats (миграция) — на случай старых юзеров. */
function migrateStats(user) {
  if (!user.stats || Array.isArray(user.stats) || typeof user.stats !== "object") user.stats = newStats();
  const s = user.stats;
  // видео: было число → массив
  if (typeof s.videosWatched === "number") s.videosWatched = [];
  if (!Array.isArray(s.videosWatched)) s.videosWatched = [];
  if (!Array.isArray(s.themesDone)) s.themesDone = [];
  if (!Array.isArray(s.ticketsDone)) s.ticketsDone = [];
  if (!Array.isArray(s.trickyMastered)) s.trickyMastered = [];
  if (typeof s.examsPassed !== "number") s.examsPassed = 0;
  if (typeof s.quizzesTaken !== "number") s.quizzesTaken = 0;
  if (typeof s.correctAnswers !== "number") s.correctAnswers = 0;
  if (typeof s.totalAnswers !== "number") s.totalAnswers = 0;
  if (!s.videoPositions || typeof s.videoPositions !== "object") s.videoPositions = {};
  return s;
}

// Тотальные размеры контента (из скачанных данных) — для расчёта процентов.
// Загружаются один раз лениво.
let TOTALS = null;
function getTotals() {
  if (TOTALS) return TOTALS;
  TOTALS = {
    videos: 88,
    themes: 42,
    tickets: 64,
    tricky: 219,
  };
  // попробуем уточнить из site/data/*.json
  try {
    const v = JSON.parse(fs.readFileSync(path.join(__dirname, "site", "data", "videos.json"), "utf8"));
    if (Array.isArray(v)) TOTALS.videos = v.length;
  } catch {}
  try {
    const t = JSON.parse(fs.readFileSync(path.join(__dirname, "site", "data", "themes.json"), "utf8"));
    if (Array.isArray(t)) TOTALS.themes = t.length;
  } catch {}
  try {
    const t = JSON.parse(fs.readFileSync(path.join(__dirname, "site", "data", "tickets.json"), "utf8"));
    if (Array.isArray(t)) TOTALS.tickets = t.length;
  } catch {}
  try {
    const t = JSON.parse(fs.readFileSync(path.join(__dirname, "site", "data", "tricky.json"), "utf8"));
    if (t && t.count) TOTALS.tricky = t.count;
  } catch {}
  return TOTALS;
}

/**
 * Рассчитать AI-оценку готовности к экзамену на основе прогресса юзера.
 * Логика повторяет оригинал: взвешенные вклады 5 категорий.
 * Возвращает { score, band, breakdown }.
 */
function computeReadiness(user) {
  const s = migrateStats(user);
  const T = getTotals();

  // Проценты по каждой категории
  const videosPct = T.videos ? s.videosWatched.length / T.videos : 0;
  const themesPct = T.themes ? s.themesDone.length / T.themes : 0;
  const ticketsPct = T.tickets ? s.ticketsDone.length / T.tickets : 0;
  const trickyPct = T.tricky ? s.trickyMastered.length / T.tricky : 0;
  // экзамен: сдан хотя бы один на >=80% +Accuracy по всем тестам
  const accuracy = s.totalAnswers > 0 ? s.correctAnswers / s.totalAnswers : 0;
  const examPct = Math.min(1, (s.examsPassed / 4) * 0.5 + accuracy * 0.5);

  // Взвешенная готовность (сумма весов = 100%)
  // видео 35%, темы 25%, билеты 20%, коварные 10%, экзамены 10%
  const score = Math.round((
    videosPct * 35 + themesPct * 25 + ticketsPct * 20 + trickyPct * 10 + examPct * 10
  ));

  // Полоса готовности
  let band, suggestedAction;
  if (score < 20) { band = "sprout"; suggestedAction = "videos"; }
  else if (score < 50) { band = "growing"; suggestedAction = "themes"; }
  else if (score < 80) { band = "ready"; suggestedAction = "tickets"; }
  else { band = "bloomed"; suggestedAction = "exams"; }

  return {
    score,
    band,
    suggestedAction,
    breakdown: {
      videos: { done: s.videosWatched.length, total: T.videos },
      themes: { done: s.themesDone.length, total: T.themes },
      tickets: { done: s.ticketsDone.length, target: T.tickets },
      tricky: { mastered: s.trickyMastered.length, pool: T.tricky },
      exams: { passed: s.examsPassed, accuracy: Math.round(accuracy * 100) },
    },
  };
}

/**
 * Записать прогресс действия юзера.
 * kind: "video" | "theme" | "ticket" | "tricky" | "exam"
 * id:   идентификатор (index для видео, ID темы/билета, ID вопроса)
 * result: для exam/quizzes — { correct, total } 
 */
function recordProgress(userId, kind, id, result) {
  const users = readDb(USERS_FILE);
  if (!users[userId]) return null;
  const s = migrateStats(users[userId]);

  if (kind === "video" && id != null) {
    if (!s.videosWatched.includes(id)) s.videosWatched.push(id);
  } else if (kind === "theme" && id != null) {
    if (!s.themesDone.includes(id)) s.themesDone.push(id);
  } else if (kind === "ticket" && id != null) {
    if (!s.ticketsDone.includes(id)) s.ticketsDone.push(id);
  } else if (kind === "tricky" && id != null) {
    if (!s.trickyMastered.includes(id)) s.trickyMastered.push(id);
  } else if (kind === "quiz" || kind === "exam") {
    // result: { correct, total }
    if (result && typeof result.correct === "number" && typeof result.total === "number") {
      s.quizzesTaken += 1;
      s.correctAnswers += result.correct;
      s.totalAnswers += result.total;
      const pct = result.total ? result.correct / result.total : 0;
      if (kind === "exam" && pct >= 0.8) s.examsPassed += 1;
      // также засчитать тему/билет как пройденный, если передан id категории
      if (id != null && result.categoryKind) {
        if (result.categoryKind === "theme" && !s.themesDone.includes(id)) s.themesDone.push(id);
        if (result.categoryKind === "ticket" && !s.ticketsDone.includes(id)) s.ticketsDone.push(id);
      }
    }
  }
  users[userId].stats = s;
  writeDb(USERS_FILE, users);
  return publicUser(users[userId]);
}

/**
 * Получить все сохранённые позиции видео пользователя { [index]: seconds }.
 */
function getVideoPositions(userId) {
  const users = readDb(USERS_FILE);
  if (!users[userId]) return {};
  return migrateStats(users[userId]).videoPositions || {};
}

/**
 * Сохранить позицию просмотра конкретного видео (синхронизация с аккаунтом).
 * index — номер видео, position — секунды.
 */
function setVideoPosition(userId, index, position) {
  const users = readDb(USERS_FILE);
  if (!users[userId]) return null;
  const s = migrateStats(users[userId]);
  if (!s.videoPositions) s.videoPositions = {};
  // сохраняем только если позиция значимая (> 3 сек) и не в самом конце
  s.videoPositions[String(index)] = Math.max(0, Math.floor(position));
  users[userId].stats = s;
  writeDb(USERS_FILE, users);
  return s.videoPositions;
}

module.exports = { register, login, logout, getUserByToken, updateStats, computeReadiness, recordProgress, migrateStats, publicUser, updateProfile, changePassword, getTitles, getVideoPositions, setVideoPosition };
