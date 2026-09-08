const L = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") return L.json(res, { ok: false, error: "Method" }, 405);
  const u = await L.userByToken(L.tokenFromReq(req));
  if (!u) return L.json(res, { ok: false, error: "Не залогинен" }, 401);
  const { kind, id, result } = req.body || {};
  const stats = L.recordProgress(L.publicUser(u).stats, kind, id, result);
  await L.saveStats(u.id, stats);
  const fresh = await L.userByToken(L.tokenFromReq(req));
  L.json(res, { ok: true, user: { ...L.publicUser(fresh), stats }, readiness: L.computeReadiness(fresh) });
};
