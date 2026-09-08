const L = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") return L.json(res, { ok: false, error: "Method" }, 405);
  const { email, password } = req.body || {};
  const u = await L.findByEmail(email || "");
  if (!u) return L.json(res, { ok: false, error: "Пользователь не найден" }, 401);
  if (L.hashPassword(password || "", u.pass_salt) !== u.pass_hash) {
    return L.json(res, { ok: false, error: "Неверный пароль" }, 401);
  }
  const token = await L.createSession(u.id);
  L.json(res, { ok: true, user: L.publicUser(u) }, 200, { "Set-Cookie": L.cookieHeader(token) });
};
