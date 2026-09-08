// Локальный сервер для сайта Yodla с системой входа/регистрации.
// Обслуживает: site/ (HTML/CSS/JS), data/ (JSON), медиафайлы,
// и auth-API (/api/register, /api/login, /api/logout, /api/me).
const http = require("http");
const fs = require("fs");
const path = require("path");
const auth = require("./auth");

const ROOT = __dirname;           // yodla-scraper/
const SITE = path.join(ROOT, "site");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

// Разрешить путь безопасно (без выхода за пределы ROOT).
function resolve(reqPath) {
  let p = decodeURIComponent(reqPath.split("?")[0]);
  if (p === "/") p = "/index.html";

  // Список кандидатов: если нет расширения — пробуем +.html (для /login → login.html)
  const hasExt = path.extname(p).length > 0;
  const candidates = hasExt ? [p] : [p + ".html", p];

  for (const cand of candidates) {
    const fromSite = path.normalize(path.join(SITE, cand));
    if (fromSite.startsWith(SITE) && fs.existsSync(fromSite) && fs.statSync(fromSite).isFile()) return fromSite;
    const fromRoot = path.normalize(path.join(ROOT, cand));
    if (fromRoot.startsWith(ROOT) && fs.existsSync(fromRoot) && fs.statSync(fromRoot).isFile()) return fromRoot;
  }
  return null;
}

// Прочитать тело запроса (JSON)
function readBody(req) {
  return new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => { d += c; if (d.length > 1e6) req.destroy(); });
    req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
  });
}

// Достать токен из cookie
function tokenFromReq(req) {
  const ck = req.headers.cookie || "";
  const m = ck.match(/yodla_session=([^;]+)/);
  return m ? m[1] : null;
}

// ── Прокси видео с Google Drive ────────────────────────────────────
// /drive-proxy/<fileId> → транслиает mp4 с Drive с поддержкой Range.
// Нужен, потому что браузер не может напрямую стримить файлы Drive
// из-за CORS, а подтверждение_COOKIE нельзя ставить со стороннего домена.
const DRIVE_MAP_FILE = path.join(__dirname, "site", "data", "drive-map.json");
function getDriveMap() {
  try { return JSON.parse(fs.readFileSync(DRIVE_MAP_FILE, "utf8")).files || {}; }
  catch { return {}; }
}
function driveStream(fileId, req, res) {
  const https = require("https");
  // confirm-token нужен Drive для выдачи стрима больших файлов
  const confirmPage = (cb) => {
    https.get({ hostname: "drive.usercontent.google.com", path: `/download?id=${fileId}&export=download`, headers: { "User-Agent": "Mozilla/5.0" } }, (r) => {
      let d = "";
      r.on("data", (c) => d += c);
      r.on("end", () => {
        const m = d.match(/confirm=([0-9A-Za-z-]+)/) || d.match(/"([0-9A-Za-z-]{10,})".*uuid/s);
        const m2 = d.match(/action="[^"]*".*?name="confirm" value="([^"]+)"/s);
        cb(m2 ? m2[1] : (m ? m[1] : "t"));
      });
    }).on("error", () => cb("t"));
  };

  const streamUrl = (confirm) => {
    const urlPath = `/download?id=${encodeURIComponent(fileId)}&export=download&confirm=${confirm}`;
    const headers = { "User-Agent": "Mozilla/5.0" };
    if (req.headers.range) headers.Range = req.headers.range;
    const up = https.request({ hostname: "drive.usercontent.google.com", path: urlPath, headers }, (pr) => {
      // редирект — следуем
      if (pr.statusCode >= 300 && pr.statusCode < 400 && pr.headers.location) {
        const u = new URL(pr.headers.location);
        https.get({ hostname: u.hostname, path: u.pathname + u.search, headers }, (pr2) => pipeResponse(pr2));
        pr.resume();
        return;
      }
      pipeResponse(pr);
    });
    function pipeResponse(pr) {
      const h = {
        "Content-Type": pr.headers["content-type"] && pr.headers["content-type"].includes("text") ? "video/mp4" : (pr.headers["content-type"] || "video/mp4"),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      };
      if (pr.headers["content-length"]) h["Content-Length"] = pr.headers["content-length"];
      if (pr.headers["content-range"]) h["Content-Range"] = pr.headers["content-range"];
      res.writeHead(pr.statusCode === 206 ? 206 : 200, h);
      pr.pipe(res);
      pr.on("error", () => res.destroy());
      res.on("close", () => up.destroy());
    }
    up.on("error", () => { if (!res.headersSent) { res.writeHead(502); res.end("Drive error"); } });
    up.end();
  };

  confirmPage(streamUrl);
}

// Достать «сырого» юзера (с полными stats) по токену — для расчёта готовности.
// auth.getUserByToken возвращает publicUser (без внутренностей), поэтому здесь
// читаем базу напрямую.
function getRawUserByToken(token) {
  if (!token) return null;
  const fs = require("fs");
  const path = require("path");
  try {
    const sessions = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "sessions.json"), "utf8"));
    const session = sessions[token];
    if (!session || new Date(session.expiresAt) < new Date()) return null;
    const users = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "users.json"), "utf8"));
    return users[session.userId] || null;
  } catch { return null; }
}

// JSON-ответ
function json(res, obj, status = 200, extraHeaders = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...extraHeaders });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];
  const method = req.method;

  // ── CORS / preflight (на всякий случай) ──────────────────────────
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // ── Auth API ─────────────────────────────────────────────────────
  if (url === "/api/register" && method === "POST") {
    const body = await readBody(req);
    const result = auth.register(body);
    if (result.token) {
      json(res, { ok: true, user: result.user }, 200,
        { "Set-Cookie": `yodla_session=${result.token}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax` });
    } else {
      json(res, { ok: false, error: result.error }, 400);
    }
    return;
  }

  if (url === "/api/login" && method === "POST") {
    const body = await readBody(req);
    const result = auth.login(body);
    if (result.token) {
      json(res, { ok: true, user: result.user }, 200,
        { "Set-Cookie": `yodla_session=${result.token}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax` });
    } else {
      json(res, { ok: false, error: result.error }, 401);
    }
    return;
  }

  if (url === "/api/logout" && method === "POST") {
    auth.logout(tokenFromReq(req));
    json(res, { ok: true }, 200, { "Set-Cookie": "yodla_session=; Path=/; Max-Age=0" });
    return;
  }

  if (url === "/api/me" && method === "GET") {
    const user = auth.getUserByToken(tokenFromReq(req));
    if (user) json(res, { ok: true, user });
    else json(res, { ok: false }, 401);
    return;
  }

  if (url === "/api/readiness" && method === "GET") {
    // AI-готовность рассчитывается из реального прогресса юзера
    const token = tokenFromReq(req);
    const sessions = auth.getUserByToken(token);
    if (!sessions) { json(res, { ok: false, error: "Не залогинен" }, 401); return; }
    // нужен «сырой» юзер с полными stats — достаём через token
    const rawUser = getRawUserByToken(token);
    const readiness = rawUser ? auth.computeReadiness(rawUser) : { score: 0, band: "sprout", breakdown: {} };
    json(res, { ok: true, readiness });
    return;
  }

  if (url === "/api/progress" && method === "POST") {
    // Записать прогресс: { kind, id, result }
    const token = tokenFromReq(req);
    const sessions = auth.getUserByToken(token);
    if (!sessions) { json(res, { ok: false, error: "Не залогинен" }, 401); return; }
    const body = await readBody(req);
    const updated = auth.recordProgress(sessions.id, body.kind, body.id, body.result);
    if (updated) {
      const rawUser = getRawUserByToken(token);
      json(res, { ok: true, user: updated, readiness: rawUser ? auth.computeReadiness(rawUser) : null });
    } else {
      json(res, { ok: false, error: "Юзер не найден" }, 400);
    }
    return;
  }

  if (url === "/api/profile" && method === "PATCH") {
    // Обновить поля профиля: { name, phone, examDate, title, language, darkMode }
    const token = tokenFromReq(req);
    const u = auth.getUserByToken(token);
    if (!u) { json(res, { ok: false, error: "Не залогинен" }, 401); return; }
    const body = await readBody(req);
    const updated = auth.updateProfile(u.id, body);
    if (updated) json(res, { ok: true, user: updated });
    else json(res, { ok: false, error: "Не удалось обновить" }, 400);
    return;
  }

  if (url === "/api/change-password" && method === "POST") {
    const token = tokenFromReq(req);
    const u = auth.getUserByToken(token);
    if (!u) { json(res, { ok: false, error: "Не залогинен" }, 401); return; }
    const body = await readBody(req);
    const result = auth.changePassword(u.id, body.oldPassword, body.newPassword);
    if (result.ok) json(res, { ok: true });
    else json(res, { ok: false, error: result.error }, 400);
    return;
  }

  if (url === "/api/titles" && method === "GET") {
    json(res, { ok: true, titles: auth.getTitles() });
    return;
  }

  // ── Синхронизация позиций видео с аккаунтом ─────────────────────
  if (url === "/api/video-progress" && method === "GET") {
    const u = auth.getUserByToken(tokenFromReq(req));
    if (!u) { json(res, { ok: false, error: "Не залогинен" }, 401); return; }
    json(res, { ok: true, positions: auth.getVideoPositions(u.id) });
    return;
  }
  if (url === "/api/video-progress" && method === "POST") {
    const u = auth.getUserByToken(tokenFromReq(req));
    if (!u) { json(res, { ok: false, error: "Не залогинен" }, 401); return; }
    const body = await readBody(req);
    if (body.index == null || typeof body.position !== "number") {
      json(res, { ok: false, error: "Нужны index и position" }, 400); return;
    }
    const positions = auth.setVideoPosition(u.id, body.index, body.position);
    json(res, { ok: true, positions });
    return;
  }

  // ── Прокси Google Drive видео ───────────────────────────────────
  if (url.startsWith("/drive-proxy/") && method === "GET") {
    const fileId = decodeURIComponent(url.slice("/drive-proxy/".length).split("?")[0]);
    if (!/^[a-zA-Z0-9_-]{10,}$/.test(fileId)) { res.writeHead(400); res.end("Bad file id"); return; }
    driveStream(fileId, req, res);
    return;
  }

  // ── Статические файлы ────────────────────────────────────────────
  const fp = resolve(req.url);
  if (!fp) { res.writeHead(404); res.end("404: " + url); return; }

  const st = fs.statSync(fp);
  const ext = path.extname(fp).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";

  // Range для видео
  const range = req.headers.range;
  if (range && ext === ".mp4") {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? parseInt(m[1]) : 0;
    let end = m && m[2] ? parseInt(m[2]) : st.size - 1;
    if (start >= st.size) { res.writeHead(416); res.end(); return; }
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${st.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      "Content-Type": type,
    });
    fs.createReadStream(fp, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, { "Content-Type": type, "Content-Length": st.size, "Accept-Ranges": "bytes" });
  fs.createReadStream(fp).pipe(res);
});

const PORT = 8765;
server.listen(PORT, () => {
  console.log(`▶ Yodla сайт:  http://localhost:${PORT}`);
  console.log(`  Вход/регистрация:  http://localhost:${PORT}/login`);
});
