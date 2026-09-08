const L = require("./_lib");

async function handle(req, res) {
  const u = await L.userByToken(L.tokenFromReq(req));
  if (!u) return L.json(res, { ok: false, error: "Не залогинен" }, 401);
  const stats = L.publicUser(u).stats;

  if (req.method === "GET") {
    return L.json(res, { ok: true, positions: stats.videoPositions || {} });
  }
  if (req.method === "POST") {
    const { index, position } = req.body || {};
    if (index == null || typeof position !== "number") {
      return L.json(res, { ok: false, error: "Нужны index и position" }, 400);
    }
    stats.videoPositions = stats.videoPositions || {};
    stats.videoPositions[String(index)] = Math.max(0, Math.floor(position));
    await L.saveStats(u.id, stats);
    return L.json(res, { ok: true, positions: stats.videoPositions });
  }
  L.json(res, { ok: false, error: "Method" }, 405);
}
module.exports = handle;
