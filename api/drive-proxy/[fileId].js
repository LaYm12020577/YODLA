// api/drive-proxy/[fileId].js — стриминг mp4 с Google Drive.
// Vercel-ограничения: ответ функции ограничен (Hobby ~4.5MB body / стрим обрывается
// по maxDuration). Поэтому: если запрошен НЕТ Range или файл большой — функция
// отвечает 302 редиректом ПРЯМО на usercontent.google.com (браузер сам стримит,
// лимиты не действуют). Если Range-запрос маленький (первые байты, metadata) —
// проксируем сами для CORS-безопасности.
const https = require("https");

module.exports = async (req, res) => {
  const fileId = req.query.fileId || (req.url || "").split("/").pop().split("?")[0];
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(fileId)) {
    res.status(400).end("Bad file id");
    return;
  }

  const dl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`;

  // Определяем размер файла и итоговый URL через HEAD-подобный GET c Range 0-0
  const probe = await new Promise((resolve) => {
    const u = new URL(dl);
    const rq = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: "GET", headers: { "User-Agent": "Mozilla/5.0", Range: "bytes=0-0" } }, (pr) => {
      pr.resume();
      const cr = pr.headers["content-range"]; // "bytes 0-0/123456789"
      resolve({
        status: pr.statusCode,
        location: pr.headers.location || null,
        size: cr ? parseInt(cr.split("/")[1], 10) : null,
        type: pr.headers["content-type"],
      });
    });
    rq.on("error", () => resolve(null));
    rq.setTimeout(8000, () => { rq.destroy(); resolve(null); });
    rq.end();
  });

  if (!probe || probe.status >= 400 || (probe.type || "").includes("text/html")) {
    // Файл недоступен / требует входа — отдаём понятную ошибку
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(502).end("Drive: файл недоступен (проверь публичный доступ)");
    return;
  }

  const range = req.headers.range;
  // Метаданные-запрос (0-1 или 0-999) или отсутствие Range у маленького файла:
  if (!range || /^bytes=0-(\d{1,4})$/.test(range)) {
    // Проксируем сами (небольшие данные, безопасно для CORS/cookie)
    const u = new URL(dl);
    if (range) u.searchParams; // Range добавим в заголовки ниже
    const headers = { "User-Agent": "Mozilla/5.0" };
    if (range) headers.Range = range;
    const up = https.request({ hostname: u.hostname, path: u.pathname + u.search, headers }, (pr) => {
      const h = {
        "Content-Type": "video/mp4",
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      };
      if (pr.headers["content-length"]) h["Content-Length"] = pr.headers["content-length"];
      if (pr.headers["content-range"]) h["Content-Range"] = pr.headers["content-range"];
      res.writeHead(pr.statusCode === 206 ? 206 : 200, h);
      pr.pipe(res);
    });
    up.on("error", () => res.destroy());
    up.end();
    return;
  }

  // Большой Range-запрос: отдаём браузеру прямую ссылку на Drive (302).
  // Браузер продолжит стримить напрямую — без лимитов serverless.
  res.setHeader("Location", dl);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.status(302).end();
};
