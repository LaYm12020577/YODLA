// live-data.js - скачивает "живые" данные с оригинала:
// профиль, AI-готовность, лидерборды Octagon и экзаменов.
// Это данные, которые делают сайт "прикольным" и живым.
//
// Запуск: node live-data.js --token "ВАШ_ТОКЕН"

const fs = require("fs");
const path = require("path");
const https = require("https");
const { URL } = require("url");

const API_BASE = "https://api.yodla-app.uz/api";
const OUT = path.join(__dirname, "site", "data");
fs.mkdirSync(OUT, { recursive: true });

function getToken() {
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === "--token") return process.argv[++i];
    if (process.argv[i].startsWith("--token=")) return process.argv[i].slice(8);
  }
  const tf = path.join(__dirname, "token.txt");
  if (fs.existsSync(tf)) return fs.readFileSync(tf, "utf8").trim();
  return process.env.YODLA_TOKEN || null;
}

function apiGet(p, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(API_BASE + p);
    https.get({ hostname: u.hostname, path: u.pathname + u.search, headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, timeout: 15000 }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve({ status: res.statusCode, body: d }));
    }).on("error", reject);
  });
}

function writeJson(name, data) {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data), "utf8");
  console.log(`  ${name}: OK`);
}

(async () => {
  const token = getToken();
  if (!token) { console.error('Токен не передан. node live-data.js --token "..."'); process.exit(1); }

  // Профиль
  console.log("— Профиль —");
  try {
    const r = await apiGet("/me/profile", token);
    if (r.status === 200) {
      const p = JSON.parse(r.body);
      writeJson("profile.json", {
        name: [p.firstName, p.lastName].filter(Boolean).join(" "),
        photo: p.profilePhoto || null,
        isPro: p.isSubscribed || p.subscriptionTier === "pro",
        tier: p.subscriptionTier,
        location: p.location,
        gender: p.gender,
        age: p.age,
        languagePreference: p.languagePreference,
        videoLanguage: p.videoLanguage,
      });
    } else console.log("  profile: HTTP", r.status);
  } catch (e) { console.log("  profile:", e.message); }

  // AI-готовность к экзамену
  console.log("— AI-готовность —");
  try {
    const r = await apiGet("/me/exam-readiness", token);
    if (r.status === 200) {
      const d = JSON.parse(r.body);
      writeJson("readiness.json", {
        score: d.readinessScore,
        band: d.band,
        suggestedAction: d.suggestedAction,
        breakdown: {
          videos: d.videos,
          tickets: d.tickets,
          themes: d.themes,
          exams: d.exams,
          tricky: d.tricky,
        },
      });
    } else console.log("  readiness: HTTP", r.status);
  } catch (e) { console.log("  readiness:", e.message); }

  // Лидерборд Octagon (1v1 битвы)
  console.log("— Octagon лидерборд —");
  try {
    const r = await apiGet("/octagon/leaderboard", token);
    if (r.status === 200) {
      const d = JSON.parse(r.body);
      const top = (d.leaderboard || []).slice(0, 50).map((u) => ({
        rank: u.rank,
        name: [u.firstName, u.lastName].filter(Boolean).join(" "),
        photo: u.profilePhoto,
        weeklyPoints: u.weeklyPoints,
        totalGames: u.totalGames,
        totalWins: u.totalWins,
        title: u.title ? u.title.name : null,
        tier: u.title ? u.title.tier : null,
        isPro: u.isPro,
        winRate: u.totalGames ? Math.round((u.totalWins / u.totalGames) * 100) : 0,
      }));
      writeJson("octagon.json", { leaderboard: top });
    } else console.log("  octagon: HTTP", r.status);
  } catch (e) { console.log("  octagon:", e.message); }

  // Лидерборд экзаменов
  console.log("— Лидерборд экзаменов —");
  try {
    const r = await apiGet("/exams/leaderboard", token);
    if (r.status === 200) {
      const d = JSON.parse(r.body);
      const top = (d.leaderboard || []).slice(0, 50).map((u) => ({
        rank: u.rank,
        name: [u.firstName, u.lastName].filter(Boolean).join(" "),
        photo: u.profilePhoto,
        timeSeconds: u.timeSeconds,
        correctCount: u.correctCount,
        title: u.title ? u.title.name : null,
        tier: u.title ? u.title.tier : null,
      }));
      writeJson("exam-leaderboard.json", { week: d.week, leaderboard: top });
    } else console.log("  exam-leaderboard: HTTP", r.status);
  } catch (e) { console.log("  exam-leaderboard:", e.message); }

  console.log("\n✓ Готово");
})();
