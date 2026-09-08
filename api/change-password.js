const L = require("./_lib");
const { sql } = require("@vercel/postgres");

module.exports = async (req, res) => {
  if (req.method !== "POST") return L.json(res, { ok: false, error: "Method" }, 405);
  const u = await L.userByToken(L.tokenFromReq(req));
  if (!u) return L.json(res, { ok: false, error: "Не залогинен" }, 401);
  const { oldPassword, newPassword } = req.body || {};
  if (L.hashPassword(oldPassword || "", u.pass_salt) !== u.pass_hash) {
    return L.json(res, { ok: false, error: "Неверный текущий пароль" }, 400);
  }
  if (!L.validPassword(newPassword)) return L.json(res, { ok: false, error: "Новый пароль должен быть не короче 6 символов" }, 400);
  const salt = L.newSalt();
  await sql`UPDATE users SET pass_salt = ${salt}, pass_hash = ${L.hashPassword(newPassword, salt)} WHERE id = ${u.id}`;
  L.json(res, { ok: true });
};
