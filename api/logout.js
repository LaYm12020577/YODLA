const L = require("./_lib");

module.exports = async (req, res) => {
  await L.deleteSession(L.tokenFromReq(req));
  L.json(res, { ok: true }, 200, { "Set-Cookie": L.cookieHeader(null) });
};
