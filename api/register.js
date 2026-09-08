const L = require("./_lib");
const { sql } = require("@vercel/postgres");

module.exports = async (req, res) => {
  if (req.method !== "POST") return L.json(res, { ok: false, error: "Method" }, 405);
  const { name, email, password } = req.body || {};
  const n = (name || "").trim();
  if (!L.validName(n)) return L.json(res, { ok: false, error: "Имя должно быть от 2 до 40 символов" }, 400);
  if (!L.validEmail(email)) return L.json(res, { ok: false, error: "Некорректный email" }, 400);
  if (!L.validPassword(password)) return L.json(res, { ok: false, error: "Пароль должен быть не короче 6 символов" }, 400);
  if (await L.findByEmail(email)) return L.json(res, { ok: false, error: "Пользователь с таким email уже существует" }, 400);

  const salt = L.newSalt();
  const id = "u_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const yodlaId = Math.floor(100 + Math.random() * 900) + "-" + Math.floor(1000 + Math.random() * 9000);
  const stats = { videosWatched: [], themesDone: [], ticketsDone: [], trickyMastered: [], examsPassed: 0, videoPositions: {}, quizzesTaken: 0, correctAnswers: 0, totalAnswers: 0 };
  await sql`INSERT INTO users (id, yodla_id, name, email, phone, exam_date, title, language, dark_mode, pass_salt, pass_hash, stats)
    VALUES (${id}, ${yodlaId}, ${n}, ${email.toLowerCase()}, NULL, NULL, 'Новичок', 'ru', false, ${salt}, ${L.hashPassword(password, salt)}, ${JSON.stringify(stats)})`;
  const u = await L.findByEmail(email);
  const token = await L.createSession(id);
  L.json(res, { ok: true, user: L.publicUser(u) }, 200, { "Set-Cookie": L.cookieHeader(token) });
};
