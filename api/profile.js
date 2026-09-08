const L = require("./_lib");
const { sql } = require("@vercel/postgres");

module.exports = async (req, res) => {
  if (req.method !== "PATCH") return L.json(res, { ok: false, error: "Method" }, 405);
  const u = await L.userByToken(L.tokenFromReq(req));
  if (!u) return L.json(res, { ok: false, error: "Не залогинен" }, 401);
  const p = req.body || {};
  if (typeof p.name === "string" && p.name.trim().length >= 2) {
    await sql`UPDATE users SET name = ${p.name.trim()} WHERE id = ${u.id}`;
  }
  if ("phone" in p) await sql`UPDATE users SET phone = ${p.phone ? String(p.phone) : null} WHERE id = ${u.id}`;
  if ("examDate" in p) await sql`UPDATE users SET exam_date = ${p.examDate || null} WHERE id = ${u.id}`;
  if ("darkMode" in p) await sql`UPDATE users SET dark_mode = ${!!p.darkMode} WHERE id = ${u.id}`;
  if (p.language && ["ru", "uz", "oz"].includes(p.language)) await sql`UPDATE users SET language = ${p.language} WHERE id = ${u.id}`;
  if (p.title && L.TITLES.some((t) => t.id === p.title)) await sql`UPDATE users SET title = ${p.title} WHERE id = ${u.id}`;
  const fresh = await L.userByToken(L.tokenFromReq(req));
  L.json(res, { ok: true, user: L.publicUser(fresh) });
};
