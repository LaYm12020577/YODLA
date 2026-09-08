const L = require("./_lib");

module.exports = async (req, res) => {
  const u = await L.userByToken(L.tokenFromReq(req));
  if (!u) return L.json(res, { ok: false, error: "Не залогинен" }, 401);
  L.json(res, { ok: true, readiness: L.computeReadiness(u) });
};
