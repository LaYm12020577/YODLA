const L = require("./_lib");

module.exports = async (req, res) => {
  const u = await L.userByToken(L.tokenFromReq(req));
  if (!u) return L.json(res, { ok: false }, 401);
  L.json(res, { ok: true, user: L.publicUser(u) });
};
