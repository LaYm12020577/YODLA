// api/_lib.js — общая логика для всех serverless-функций (Postgres).
const crypto = require("crypto");

const TITLES = [
  { id: "Новичок", label: "🌱 Новичок", minScore: 0 },
  { id: "Ученик", label: "📚 Ученик", minScore: 10 },
  { id: "Знаток", label: "💡 Знаток", minScore: 30 },
  { id: "Мастер", label: "⭐ Мастер", minScore: 50 },
  { id: "Профи", label: "🏆 Профи", minScore: 75 },
  { id: "Легенда", label: "👑 Легенда", minScore: 90 },
];

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
}
const newSalt = () => crypto.randomBytes(16).toString("hex");
const newToken = () => crypto.randomBytes(32).toString("hex");
const validEmail = (e) => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 120;
const validName = (n) => typeof n === "string" && n.trim().length >= 2 && n.trim().length <= 40;
const validPassword = (p) => typeof p === "string" && p.length >= 6 && p.length <= 100;

// ── сессии ──────────────────────────────────────────────────────
async function createSession(userId) {
  const { sql } = require("@vercel/postgres");
  const token = newToken();
  await sql`DELETE FROM sessions WHERE user_id = ${userId}`;
  await sql`INSERT INTO sessions (token, user_id, expires_at) VALUES (${token}, ${userId}, now() + interval '30 days')`;
  return token;
}

async function userByToken(token) {
  if (!token) return null;
  const { sql } = require("@vercel/postgres");
  const r = await sql`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ${token} AND s.expires_at > now() LIMIT 1`;
  return r.rows[0] || null;
}

async function deleteSession(token) {
  const { sql } = require("@vercel/postgres");
  await sql`DELETE FROM sessions WHERE token = ${token}`;
}

// ── пользователи ────────────────────────────────────────────────
function publicUser(u) {
  let stats = {};
  try { stats = u.stats ? JSON.parse(u.stats) : {}; } catch {}
  if (!Array.isArray(stats.videosWatched)) stats.videosWatched = [];
  if (!Array.isArray(stats.themesDone)) stats.themesDone = [];
  if (!Array.isArray(stats.ticketsDone)) stats.ticketsDone = [];
  if (!Array.isArray(stats.trickyMastered)) stats.trickyMastered = [];
  if (!stats.videoPositions || typeof stats.videoPositions !== "object") stats.videoPositions = {};
  const num = (v) => (typeof v === "number" ? v : 0);
  stats.examsPassed = num(stats.examsPassed); stats.quizzesTaken = num(stats.quizzesTaken);
  stats.correctAnswers = num(stats.correctAnswers); stats.totalAnswers = num(stats.totalAnswers);
  return {
    id: u.id, yodlaId: u.yodla_id, name: u.name, email: u.email,
    phone: u.phone, examDate: u.exam_date, title: u.title || "Новичок",
    language: u.language || "ru", darkMode: !!u.dark_mode,
    createdAt: u.created_at ? new Date(u.created_at).toISOString() : null,
    stats,
  };
}

async function findByEmail(email) {
  const { sql } = require("@vercel/postgres");
  const r = await sql`SELECT * FROM users WHERE email = ${email.toLowerCase()} LIMIT 1`;
  return r.rows[0] || null;
}

async function saveStats(userId, stats) {
  const { sql } = require("@vercel/postgres");
  await sql`UPDATE users SET stats = ${JSON.stringify(stats)} WHERE id = ${userId}`;
}

// ── готовность (та же формула, что локально) ─────────────────────
function totals() {
  // на Vercel site/data/*.json доступны в репо, но для простоты — константы из данных
  return { videos: 88, themes: 42, tickets: 64, tricky: 219 };
}

function computeReadiness(u) {
  const s = publicUser(u).stats;
  const T = totals();
  const videosPct = s.videosWatched.length / T.videos;
  const themesPct = s.themesDone.length / T.themes;
  const ticketsPct = s.ticketsDone.length / T.tickets;
  const trickyPct = s.trickyMastered.length / T.tricky;
  const accuracy = s.totalAnswers > 0 ? s.correctAnswers / s.totalAnswers : 0;
  const examPct = Math.min(1, (s.examsPassed / 4) * 0.5 + accuracy * 0.5);
  const score = Math.round(videosPct * 35 + themesPct * 25 + ticketsPct * 20 + trickyPct * 10 + examPct * 10);
  let band, suggestedAction;
  if (score < 20) { band = "sprout"; suggestedAction = "videos"; }
  else if (score < 50) { band = "growing"; suggestedAction = "themes"; }
  else if (score < 80) { band = "ready"; suggestedAction = "tickets"; }
  else { band = "bloomed"; suggestedAction = "exams"; }
  return {
    score, band, suggestedAction,
    breakdown: {
      videos: { done: s.videosWatched.length, total: T.videos },
      themes: { done: s.themesDone.length, total: T.themes },
      tickets: { done: s.ticketsDone.length, target: T.tickets },
      tricky: { mastered: s.trickyMastered.length, pool: T.tricky },
      exams: { passed: s.examsPassed, accuracy: Math.round(accuracy * 100) },
    },
  };
}

function recordProgress(stats, kind, id, result) {
  if (kind === "video" && id != null) { if (!stats.videosWatched.includes(id)) stats.videosWatched.push(id); }
  else if (kind === "theme" && id != null) { if (!stats.themesDone.includes(id)) stats.themesDone.push(id); }
  else if (kind === "ticket" && id != null) { if (!stats.ticketsDone.includes(id)) stats.ticketsDone.push(id); }
  else if (kind === "tricky" && id != null) { if (!stats.trickyMastered.includes(id)) stats.trickyMastered.push(id); }
  else if (kind === "quiz" || kind === "exam") {
    if (result && typeof result.correct === "number" && typeof result.total === "number") {
      stats.quizzesTaken += 1;
      stats.correctAnswers += result.correct;
      stats.totalAnswers += result.total;
      const pct = result.total ? result.correct / result.total : 0;
      if (kind === "exam" && pct >= 0.8) stats.examsPassed += 1;
      if (id != null && result.categoryKind) {
        if (result.categoryKind === "theme" && !stats.themesDone.includes(id)) stats.themesDone.push(id);
        if (result.categoryKind === "ticket" && !stats.ticketsDone.includes(id)) stats.ticketsDone.push(id);
      }
    }
  }
  return stats;
}

// ── HTTP-хелперы ────────────────────────────────────────────────
const json = (res, obj, status = 200, extra = {}) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  for (const k in extra) res.setHeader(k, extra[k]);
  res.status(status).json(obj);
};
const tokenFromReq = (req) => {
  const ck = req.headers.cookie || "";
  const m = ck.match(/yodla_session=([^;]+)/);
  return m ? m[1] : null;
};
const cookieHeader = (token) =>
  token
    ? `yodla_session=${token}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`
    : `yodla_session=; Path=/; Max-Age=0`;

module.exports = {
  TITLES, hashPassword, newSalt, validEmail, validName, validPassword,
  createSession, userByToken, deleteSession, publicUser, findByEmail, saveStats,
  computeReadiness, recordProgress, json, tokenFromReq, cookieHeader,
};
