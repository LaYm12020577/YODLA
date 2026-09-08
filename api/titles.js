const L = require("./_lib");

module.exports = async (req, res) => {
  L.json(res, { ok: true, titles: L.TITLES });
};
