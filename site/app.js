/* ═══════════════════════════════════════════════════════════════
   Yodla — приложение (роутинг + рендер секций)
   ═══════════════════════════════════════════════════════════════ */
"use strict";

const app = document.getElementById("app");
const DATA = {}; // кэш загруженных JSON
let currentUser = null; // данные залогиненного юзера
let guestMode = false;  // true — сайт открыт без входа, прогресс в localStorage

/* ── Гостевой прогресс (localStorage) ──────────────────────────── */
function loadGuestStats() {
  try { return JSON.parse(localStorage.getItem("yodla_guest_stats")) || emptyStats(); } catch { return emptyStats(); }
}
function saveGuestStats() {
  if (!guestMode || !currentUser) return;
  try { localStorage.setItem("yodla_guest_stats", JSON.stringify(currentUser.stats)); } catch {}
}
function emptyStats() {
  return { videosWatched: [], themesDone: [], ticketsDone: [], trickyMastered: [],
    examsPassed: 0, videoPositions: {}, quizzesTaken: 0, correctAnswers: 0, totalAnswers: 0 };
}
// Гостевая готовность — та же формула, что на сервере
function guestReadiness() {
  const s = currentUser?.stats || emptyStats();
  const T = { videos: 88, themes: 42, tickets: 64, tricky: 219 };
  const acc = s.totalAnswers > 0 ? s.correctAnswers / s.totalAnswers : 0;
  const score = Math.round(
    (s.videosWatched.length / T.videos) * 35 + (s.themesDone.length / T.themes) * 25 +
    (s.ticketsDone.length / T.tickets) * 20 + (s.trickyMastered.length / T.tricky) * 10 +
    (Math.min(1, (s.examsPassed / 4) * 0.5 + acc * 0.5)) * 10
  );
  let band = "sprout", suggestedAction = "videos";
  if (score >= 80) { band = "bloomed"; suggestedAction = "exams"; }
  else if (score >= 50) { band = "ready"; suggestedAction = "tickets"; }
  else if (score >= 20) { band = "growing"; suggestedAction = "themes"; }
  return { score, band, suggestedAction,
    breakdown: { videos: { done: s.videosWatched.length, total: T.videos },
      themes: { done: s.themesDone.length, total: T.themes },
      tickets: { done: s.ticketsDone.length, target: T.tickets },
      tricky: { mastered: s.trickyMastered.length, pool: T.tricky },
      exams: { passed: s.examsPassed, accuracy: Math.round(acc * 100) } } };
}

/* ── Применить переводы к навигации ────────────────────────────── */
function translateNav() {
  const map = {
    navHome: "nav_home", navVideos: "nav_videos", navSigns: "nav_signs",
    navFines: "nav_fines", navTraining: "nav_training", navArena: "nav_arena",
  };
  for (const id in map) {
    const el = document.getElementById(id);
    if (el) el.textContent = t(map[id]);
  }
}

/* ── Модалка смены языка ───────────────────────────────────────── */
function showLangModal() {
  closeModal();
  const modal = el("div", "modal-overlay");
  modal.innerHTML = `
    <div class="modal glass fade-up">
      <div class="modal-head">
        <h3>${t("profile_language")}</h3>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="lang-list">
        ${SUPPORTED_LANGS.map(l => `
          <button class="lang-opt ${l.id === getLang() ? "active" : ""}" data-lang="${l.id}">
            <span class="lang-flag">${l.flag}</span>
            <span class="lang-name">${l.label}</span>
            ${l.id === getLang() ? '<span class="lang-check">✓</span>' : ""}
          </button>`).join("")}
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelectorAll(".lang-opt").forEach((b) => {
    b.onclick = () => {
      setLang(b.dataset.lang);
      // сохранить в профиле если залогинен
      if (currentUser) {
        fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: b.dataset.lang }) })
          .then(r => r.json()).then(d => { if (d.ok) currentUser = d.user; }).catch(() => {});
      }
      closeModal();
      translateNav();
      // перерисовать текущую страницу
      go(currentRoute, currentParam);
    };
  });
}

/* ── Закрыть модалку ───────────────────────────────────────────── */
function closeModal() {
  document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
}

/* ── Глобальный поиск ──────────────────────────────────────────── */
async function showSearch() {
  closeModal();
  // предзагрузить данные
  const [videos, signs, fines, themes, tricky] = await Promise.all([
    load("videos"), load("signs"), load("fines"), load("themes"), load("tricky"),
  ]);

  const modal = el("div", "modal-overlay");
  modal.innerHTML = `
    <div class="modal glass search-modal fade-up">
      <div class="modal-head">
        <h3>${t("search_title")}</h3>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="search-wrap" style="margin:0 0 16px;max-width:none">
        <input class="search-box" id="globalSearch" placeholder="${t("search_placeholder")}" autocomplete="off" style="padding-left:46px">
      </div>
      <div class="search-results" id="searchResults">
        <div class="search-hint">${t("search_placeholder")}</div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  const input = modal.querySelector("#globalSearch");
  const results = modal.querySelector("#searchResults");
  let timer = null;

  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => doSearch(input.value), 200);
  });
  setTimeout(() => input.focus(), 100);

  function doSearch(q) {
    q = q.toLowerCase().trim();
    if (!q || q.length < 2) { results.innerHTML = `<div class="search-hint">${t("search_placeholder")}</div>`; return; }

    const found = [];
    // Видео
    (videos || []).forEach((v) => {
      if (v.title.toLowerCase().includes(q)) found.push({ type: "video", title: v.title, sub: `${t("sec_videos")} · ${v.lang}`, data: v });
    });
    // Знаки
    (signs || []).forEach((c) => c.signs.forEach((s) => {
      if ((s.number + " " + (s.description || "")).toLowerCase().includes(q))
        found.push({ type: "sign", title: `${s.number} — ${(s.description || "").slice(0, 60)}`, sub: `${t("sec_signs")} · ${c.category}`, data: s });
    }));
    // Штрафы
    (fines || []).forEach((c) => c.fines.forEach((f) => {
      if ((f.violation + " ст." + f.article).toLowerCase().includes(q))
        found.push({ type: "fine", title: `Ст.${f.article} — ${f.violation}`, sub: `${t("sec_fines")} · ${c.category} · ${parseInt(f.fineUzs || 0).toLocaleString()} сум`, data: f });
    }));
    // Вопросы из тем
    (themes || []).forEach((th) => th.questions.forEach((qq, i) => {
      if (qq.question && qq.question.toLowerCase().includes(q))
        found.push({ type: "question", title: qq.question.slice(0, 80), sub: `${t("sec_training")} · ${th.name} №${i + 1}`, data: { kind: "theme", items: [th], index: 0, title: th.name } });
    }));
    // Коварные
    if (tricky && tricky.questions) tricky.questions.forEach((qq, i) => {
      if (qq.question && qq.question.toLowerCase().includes(q))
        found.push({ type: "question", title: qq.question.slice(0, 80), sub: `${t("train_tricky")} №${i + 1}`, data: { kind: "tricky", items: [tricky], index: 0, title: tricky.name } });
    });

    if (!found.length) { results.innerHTML = `<div class="search-hint">${t("search_no_results")}</div>`; return; }
    results.innerHTML = `<div class="search-count">${found.length} ${t("search_results")}</div>`;
    found.slice(0, 40).forEach((r) => {
      const icons = { video: "🎬", sign: "🚸", fine: "💸", question: "❓" };
      const item = el("div", "search-item");
      item.innerHTML = `<div class="si-icon">${icons[r.type] || "•"}</div><div class="si-main"><div class="si-title">${esc(r.title)}</div><div class="si-sub">${esc(r.sub)}</div></div><div class="si-arrow">→</div>`;
      item.onclick = () => {
        closeModal();
        if (r.type === "video") go("video", r.data);
        else if (r.type === "sign") go("signs");
        else if (r.type === "fine") go("fines");
        else if (r.type === "question") go("quiz", r.data);
      };
      results.appendChild(item);
    });
  }
}

/* ── Сессия при загрузке ─────────────────────────────────────────
   Сайт открыт для всех: без обязательного входа.
   Если есть живая сессия — подхватываем пользователя (бонус: прогресс),
   нет — работаем как гость. Редиректа на /login больше нет. */
async function checkSession() {
  try {
    const r = await fetch("/api/me");
    if (!r.ok) return true; // гость — это нормально
    const d = await r.json();
    if (d.ok) currentUser = d.user;
  } catch { /* API недоступен — гость, сайт всё равно работает */ }
  return true;
}
async function doLogout() {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/login";
}

/* ── API прогресса (для текущего юзера) ─────────────────────────── */
async function apiProgress(kind, id, result) {
  // Гость: пишем в localStorage по той же логике, что на сервере
  if (guestMode) {
    const s = currentUser.stats;
    if (kind === "video" && id != null) { if (!s.videosWatched.includes(id)) s.videosWatched.push(id); }
    else if (kind === "theme" && id != null) { if (!s.themesDone.includes(id)) s.themesDone.push(id); }
    else if (kind === "ticket" && id != null) { if (!s.ticketsDone.includes(id)) s.ticketsDone.push(id); }
    else if (kind === "tricky" && id != null) { if (!s.trickyMastered.includes(id)) s.trickyMastered.push(id); }
    else if ((kind === "quiz" || kind === "exam") && result && typeof result.correct === "number") {
      s.quizzesTaken += 1; s.correctAnswers += result.correct; s.totalAnswers += result.total;
      if (kind === "exam" && result.correct / result.total >= 0.8) s.examsPassed += 1;
      if (id != null && result.categoryKind === "theme" && !s.themesDone.includes(id)) s.themesDone.push(id);
      if (id != null && result.categoryKind === "ticket" && !s.ticketsDone.includes(id)) s.ticketsDone.push(id);
    }
    saveGuestStats();
    return;
  }
  try {
    await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id, result }),
    });
  } catch (e) { /* прогресс не критичен, игнорируем ошибки сети */ }
}

/* ── Загрузка данных (с кэшем) ─────────────────────────────────── */
async function load(name) {
  if (DATA[name]) return DATA[name];
  try {
    const r = await fetch(`data/${name}.json`);
    DATA[name] = await r.json();
  } catch (e) {
    DATA[name] = null;
    console.error(`Не удалось загрузить data/${name}.json`, e);
  }
  return DATA[name];
}

/* ── Роутинг ───────────────────────────────────────────────────── */
const routes = {
  home: renderHome,
  videos: renderVideos,
  "video": renderVideoPlayer,
  signs: renderSigns,
  fines: renderFines,
  training: renderTrainingHub,
  quiz: renderQuiz,
  arena: renderArena,
  profile: renderProfile,
};

function go(route, param) {
  currentRoute = route;
  currentParam = param;
  window.scrollTo(0, 0);
  (routes[route] || renderHome)(param);
  // активная подсветка в навигации
  document.querySelectorAll(".nav-link").forEach((b) => {
    const map = { quiz: "training", video: "videos", arena: "arena" };
    const target = map[route] || route;
    b.classList.toggle("active", b.dataset.route === target);
  });
}
let currentRoute = "home", currentParam = null;

// клики по навигации
document.querySelectorAll("[data-route]").forEach((el) => {
  const handler = () => go(el.dataset.route);
  el.addEventListener("click", handler);
  el.addEventListener("keydown", (e) => { if (e.key === "Enter") handler(); });
});

/* ── Утилиты рендера ───────────────────────────────────────────── */
function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function setApp(node) {
  app.innerHTML = "";
  if (Array.isArray(node)) node.forEach((n) => app.appendChild(n));
  else app.appendChild(node);
}
function head(crumb, title, desc) {
  const wrap = el("div", "section-head fade-up");
  if (crumb) wrap.appendChild(el("div", "crumb", esc(crumb)));
  wrap.appendChild(el("h2", "", esc(title)));
  if (desc) wrap.appendChild(el("p", "", esc(desc)));
  return wrap;
}
function backBtn(label, route) {
  const b = el("button", "back-btn", `← ${esc(label || "Назад")}`);
  b.onclick = () => go(route || "home");
  return b;
}

/* ═══════════════════════════════════════════════════════════════
   ГЛАВНАЯ
   ═══════════════════════════════════════════════════════════════ */
async function renderHome() {
  const [videos, signs, fines, themes, tickets, tricky, profile] = await Promise.all([
    load("videos"), load("signs"), load("fines"), load("themes"), load("tickets"), load("tricky"),
    load("profile"),
  ]);
  // Готовность: гость — локальный расчёт, залогиненный — с сервера
  let readiness = null;
  if (guestMode) readiness = guestReadiness();
  else { try { const r = await fetch("/api/readiness"); const d = await r.json(); if (d.ok) readiness = d.readiness; } catch {} }
  const totalSigns = (signs || []).reduce((s, c) => s + c.signs.length, 0);
  const totalQ = (themes || []).reduce((s, t) => s + t.count, 0)
    + (tickets || []).reduce((s, t) => s + t.count, 0)
    + (tricky?.count || 0);

  const frag = document.createDocumentFragment();

  // Профиль-карточка: приоритет — залогиненный юзер, затем данные из profile.json
  const displayName = currentUser ? currentUser.name : (profile?.name || "Ученик");
  const initials = (displayName || "?").split(" ").map(w => w[0]).slice(0,2).join("").toUpperCase();
  const pc = el("div", "profile-card fade-up");
  const avatar = (currentUser ? null : profile?.photo)
    ? `<img class="profile-avatar" src="${esc(profile.photo)}" alt="" onerror="this.outerHTML='<div class=&quot;profile-avatar&quot;>${esc(initials)}</div>'">`
    : `<div class="profile-avatar">${esc(initials)}</div>`;
  const meta = currentUser
    ? `${esc(currentUser.email)}`
    : `${esc(profile?.location || "")} · ${profile?.videoLanguage ? profile.videoLanguage.toUpperCase() + " видео" : ""}`;
  const proTag = (!currentUser && profile?.isPro) ? '<span class="pro-badge">★ PRO</span>' : "";
  pc.innerHTML = `
    ${avatar}
    <div>
      <div class="pname">${t("home_greeting")}, ${esc(displayName.split(" ")[0])}! ${proTag}</div>
      <div class="pmeta">${meta}</div>
    </div>`;
  frag.appendChild(pc);

  // Hero
  const hero = el("section", "hero fade-up");
  hero.innerHTML = `
    <div class="hero-badge"><span class="dot"></span> ${t("home_badge")}</div>
    <h1>${t("home_title_1")}<br><span class="accent">${t("home_title_2")}</span></h1>
    <p class="sub">${t("home_sub")}</p>
    <div class="cta-row">
      <button class="btn btn-primary" onclick="go('videos')">${t("home_cta_videos")}</button>
      <button class="btn btn-lime" onclick="go('training')">${t("home_cta_train")}</button>
    </div>
    <div class="hero-stats">
      <div class="stat"><div class="num" data-count="${(videos||[]).length}">0</div><div class="label">${t("home_stat_videos")}</div></div>
      <div class="stat"><div class="num" data-count="${totalSigns}">0</div><div class="label">${t("home_stat_signs")}</div></div>
      <div class="stat"><div class="num" data-count="${(fines||[]).reduce((s,c)=>s+c.fines.length,0)}">0</div><div class="label">${t("home_stat_fines")}</div></div>
      <div class="stat"><div class="num" data-count="${totalQ}">0</div><div class="label">${t("home_stat_questions")}</div></div>
    </div>`;
  frag.appendChild(hero);

  // AI-готовность (если есть данные)
  if (readiness) {
    frag.appendChild(renderReadinessGauge(readiness));
  }

  frag.appendChild(el("div", "divider-glow"));

  // Заголовок секций
  frag.appendChild(head(t("nav_home"), t("home_sections_title"), t("home_sections_sub")));

  // Сетка секций
  const grid = el("div", "section-grid fade-up");
  const cards = [
    { icon: "🎬", t: t("sec_videos"), d: `${(videos||[]).length} ${t("sec_videos_d")}`, route: "videos", lime: false },
    { icon: "🚸", t: t("sec_signs"), d: `${totalSigns} ${t("sec_signs_d")}`, route: "signs", lime: true },
    { icon: "💸", t: t("sec_fines"), d: `${(fines||[]).reduce((s,c)=>s+c.fines.length,0)} ${t("sec_fines_d")}`, route: "fines", lime: false },
    { icon: "🎯", t: t("sec_training"), d: `${totalQ} ${t("sec_training_d")}`, route: "training", lime: true },
    { icon: "⚔️", t: t("sec_arena"), d: t("sec_arena_d"), route: "arena", lime: false },
  ];
  cards.forEach((c) => {
    const card = el("div", `feature-card ${c.lime ? "lime" : ""}`);
    card.innerHTML = `<div class="icon">${c.icon}</div><h3>${esc(c.t)}</h3><p>${esc(c.d)}</p><div class="arrow">→</div>`;
    card.onclick = () => go(c.route);
    grid.appendChild(card);
  });
  frag.appendChild(grid);

  setApp(frag);
  animateCounters();
}

/* ── AI-готовность: круговой индикатор + полоски ────────────────── */
function renderReadinessGauge(rd) {
  const wrap = el("section", "panel readiness fade-up");
  const score = rd.score || 0;
  const circumference = 2 * Math.PI * 76; // r=76
  const offset = circumference * (1 - score / 100);

  const bandLabels = { sprout: "🌱 Росток", growing: "🌿 Растёт", ready: "🔥 Готов", bloomed: "🏆 Профи" };
  const band = bandLabels[rd.band] || "🌱 Росток";

  // вклады по категориям
  const b = rd.breakdown || {};
  const bars = [
    { icon: "🎬", name: t("ai_cat_videos"), done: b.videos?.done, total: b.videos?.total, lime: true },
    { icon: "📚", name: t("ai_cat_themes"), done: b.themes?.done, total: b.themes?.total, lime: false },
    { icon: "🎟", name: t("ai_cat_tickets"), done: b.tickets?.done, total: b.tickets?.target, lime: false },
    { icon: "🧠", name: t("ai_cat_tricky"), done: b.tricky?.mastered, total: b.tricky?.pool, lime: true },
  ];
  const barsHtml = bars.map(bar => {
    const pct = bar.total ? Math.min(100, Math.round((bar.done || 0) / bar.total * 100)) : 0;
    return `<div class="rb-item">
      <div class="rb-icon">${bar.icon}</div>
      <div class="rb-name">${esc(bar.name)}</div>
      <div class="rb-bar"><div class="rb-fill ${bar.lime ? "lime" : ""}" style="width:${pct}%"></div></div>
      <div class="rb-val">${bar.done || 0}/${bar.total || 0}</div>
    </div>`;
  }).join("");

  wrap.innerHTML = `
    <div class="readiness-gauge">
      <svg viewBox="0 0 180 180">
        <circle class="track" cx="90" cy="90" r="76"/>
        <circle class="arc" cx="90" cy="90" r="76" stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}"/>
      </svg>
      <div class="label"><div><div class="pct" data-count="${score}">0</div><div class="sub">${t("ai_ready")}</div></div></div>
    </div>
    <div class="readiness-info">
      <span class="band">${band}</span>
      <h3>${t("ai_title")}</h3>
      <p>${t("ai_sub")}</p>
      <div class="readiness-bars">${barsHtml}</div>
    </div>`;

  // анимация дуги после рендера
  setTimeout(() => {
    const arc = wrap.querySelector(".arc");
    if (arc) arc.style.strokeDashoffset = offset;
    animateCounters(wrap);
  }, 100);
  return wrap;
}

/* ── Анимация счётчиков ─────────────────────────────────────────── */
function animateCounters(scope = document) {
  scope.querySelectorAll("[data-count]").forEach((node) => {
    const target = parseInt(node.dataset.count) || 0;
    if (target === 0) { node.textContent = "0"; return; }
    const dur = 900; const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      node.textContent = Math.round(target * eased);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}

/* ═══════════════════════════════════════════════════════════════
   ВИДЕО
   ═══════════════════════════════════════════════════════════════ */
let videoFilter = "ALL";

async function renderVideos() {
  const videos = await load("videos");
  const frag = document.createDocumentFragment();
  frag.appendChild(head(`${t("nav_home")} / ${t("nav_videos")}`, t("videos_title"), `${videos.length} ${t("videos_sub")}`));

  // фильтр по языку + поиск
  const controls = el("div", "row fade-up");
  const chips = el("div", "chips");
  ["ALL", "UZ", "RU"].forEach((lng) => {
    const c = el("button", `chip ${lng === videoFilter ? "active" : ""}`, lng === "ALL" ? t("videos_all") : lng);
    c.onclick = () => { videoFilter = lng; go("videos"); };
    chips.appendChild(c);
  });
  controls.appendChild(chips);

  const sw = el("div", "search-wrap");
  sw.innerHTML = `<input class="search-box" id="vSearch" placeholder="${t("videos_search")}" />`;
  controls.appendChild(sw);
  frag.appendChild(controls);

  const grid = el("div", "grid");
  frag.appendChild(grid);

  function renderGrid() {
    const q = (document.getElementById("vSearch")?.value || "").toLowerCase().trim();
    grid.innerHTML = "";
    const list = videos
      .filter((v) => videoFilter === "ALL" || v.lang === videoFilter)
      .filter((v) => !q || v.title.toLowerCase().includes(q));
    if (!list.length) { grid.appendChild(el("div", "empty", `<div class="big">🔍</div>${t("search_no_results")}`)); return; }
    list.forEach((v) => {
      const card = el("div", "video-card fade-up");
      card.innerHTML = `
        <div class="video-thumb"><span class="lang-tag">${esc(v.lang)}</span></div>
        <div class="video-body">
          <div class="idx">№ ${v.index}</div>
          <div class="title">${esc(v.title)}</div>
        </div>`;
      card.onclick = () => go("video", v);
      grid.appendChild(card);
    });
  }
  renderGrid();
  const si = document.getElementById("vSearch");
  if (si) si.addEventListener("input", renderGrid);
  setApp(frag);
}

async function renderVideoPlayer(v) {
  const frag = document.createDocumentFragment();
  frag.appendChild(backBtn(t("to_videos"), "videos"));
  frag.appendChild(head(`${t("quiz_question")} №${v.index}`, v.title));

  // Позиция просмотра: гость — localStorage, залогиненный — с сервера (аккаунт).
  const posKey = `video_pos_${v.index}`;
  let savedPos = 0;
  try { savedPos = parseFloat(localStorage.getItem(posKey) || "0") || 0; } catch {}
  if (guestMode) {
    const pos = currentUser?.stats?.videoPositions?.[String(v.index)];
    if (pos) savedPos = pos;
  } else {
    try {
      const r = await fetch("/api/video-progress");
      const d = await r.json();
      if (d.ok && d.positions && d.positions[String(v.index)]) {
        savedPos = parseFloat(d.positions[String(v.index)]) || savedPos;
      }
    } catch {}
  }

  // Контейнер для кастомного плеера (стиль YouTube)
  const wrap = el("div", "player-wrap fade-up");
  frag.appendChild(wrap);

  // Бейдж «продолжить с X»
  if (savedPos > 5) {
    const mm = Math.floor(savedPos / 60), ss = Math.floor(savedPos % 60).toString().padStart(2, "0");
    const resume = el("div", "video-resume fade-up");
    resume.innerHTML = `▶ ${t("videos_continue")}: ${mm}:${ss}`;
    frag.appendChild(resume);
  }
  setApp(frag);

  // Источник видео: Google Drive (если есть маппинг) или локальный файл
  let src = `../${v.file}`;
  const driveMap = await load("drive-map");
  const fileId = driveMap?.files?.[String(v.index)];
  if (fileId) src = `/drive-proxy/${fileId}`;

  // Создать кастомный плеер YPlayer
  const player = new YPlayer(wrap, { src, startTime: savedPos });

  // Синхронизация позиции: гость — localStorage, юзер — аккаунт на сервере
  player.on("position", (sec) => {
    try { localStorage.setItem(posKey, String(sec)); } catch {}
    if (guestMode) {
      currentUser.stats.videoPositions = currentUser.stats.videoPositions || {};
      currentUser.stats.videoPositions[String(v.index)] = sec;
      saveGuestStats();
      return;
    }
    fetch("/api/video-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index: v.index, position: sec }),
    }).catch(() => {});
  });

  // Записать прогресс просмотра (засчитать урок)
  apiProgress("video", v.index);
}

/* ═══════════════════════════════════════════════════════════════
   ЗНАКИ
   ═══════════════════════════════════════════════════════════════ */
async function renderSigns() {
  const signs = await load("signs");
  const frag = document.createDocumentFragment();
  frag.appendChild(head(`${t("nav_home")} / ${t("nav_signs")}`, t("signs_title"), `${signs.reduce((s, c) => s + c.signs.length, 0)} ${t("sec_signs_d")}`));

  const allLabel = t("videos_all");
  const chips = el("div", "chips");
  chips.appendChild(chipBtn(allLabel, true));
  signs.forEach((c) => chips.appendChild(chipBtn(c.category)));
  frag.appendChild(chips);

  const grid = el("div", "sign-grid");
  frag.appendChild(grid);

  function show(cat) {
    grid.innerHTML = "";
    const cats = cat === allLabel ? signs : signs.filter((c) => c.category === cat);
    cats.forEach((c) => {
      c.signs.forEach((s) => {
        const it = el("div", "sign-item fade-up");
        const desc = s.description || "";
        it.innerHTML = `
          <div class="sign-img">
            ${s.image
              ? `<img src="${esc(s.image)}" alt="${esc(s.number)}" loading="lazy" onerror="this.outerHTML='<div class=&quot;ph&quot;>🚸</div>'">`
              : `<div class="ph">🚸</div>`}
          </div>
          <span class="num">${esc(s.number)}</span>
          <div class="desc">${esc(desc)}</div>`;
        grid.appendChild(it);
      });
    });
  }
  // bind chips
  let activeCat = allLabel;
  chips.querySelectorAll(".chip").forEach((c, i) => {
    c.onclick = () => {
      activeCat = i === 0 ? allLabel : signs[i - 1].category;
      chips.querySelectorAll(".chip").forEach((x) => x.classList.remove("active"));
      c.classList.add("active");
      show(activeCat);
    };
  });
  show(allLabel);
  setApp(frag);
}
function chipBtn(label, active) {
  return el("button", `chip ${active ? "active" : ""}`, esc(label));
}

/* ═══════════════════════════════════════════════════════════════
   ШТРАФЫ
   ═══════════════════════════════════════════════════════════════ */
async function renderFines() {
  const fines = await load("fines");
  const frag = document.createDocumentFragment();
  frag.appendChild(head(`${t("nav_home")} / ${t("nav_fines")}`, t("fines_title"), `${fines.reduce((s, c) => s + c.fines.length, 0)} ${t("sec_fines_d")}`));

  const wrap = el("div", "", "");
  frag.appendChild(wrap);

  fines.forEach((cat) => {
    const panel = el("div", "panel fade-up");
    panel.style.marginBottom = "16px";
    let rows = "";
    cat.fines.forEach((f) => {
      const pts = f.penaltyPoints && f.penaltyPoints !== "0.0" ? `<span class="badge-pts">${esc(f.penaltyPoints)}</span>` : "—";
      const sum = f.fineUzs ? `${parseInt(f.fineUzs).toLocaleString("ru-RU")} сум` : "—";
      rows += `<tr>
        <td class="art">${esc(f.article)}</td>
        <td>${esc(f.violation)}</td>
        <td>${esc(f.fineBhm || "—")}</td>
        <td class="sum">${sum}</td>
        <td>${pts}</td>
      </tr>`;
    });
    panel.innerHTML = `
      <h3 style="margin-bottom:6px">${esc(cat.category)}</h3>
      <div class="muted" style="margin-bottom:14px;font-size:0.85rem">${cat.fines.length} ${t("fines_violation")}</div>
      <div style="overflow-x:auto">
        <table class="fine-table">
          <thead><tr><th>${t("fines_article")}</th><th>${t("fines_violation")}</th><th>БЦМ</th><th>${t("fines_amount")}</th><th>${t("fines_points")}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    wrap.appendChild(panel);
  });
  setApp(frag);
}

/* ═══════════════════════════════════════════════════════════════
   ТРЕНИРОВКИ (хаб)
   ═══════════════════════════════════════════════════════════════ */
async function renderTrainingHub() {
  const [themes, tickets, tricky, marathon, exam] = await Promise.all([
    load("themes"), load("tickets"), load("tricky"), load("marathon"), load("exam"),
  ]);
  const frag = document.createDocumentFragment();
  frag.appendChild(head(`${t("nav_home")} / ${t("nav_training")}`, t("train_title"), t("train_sub")));

  const grid = el("div", "section-grid fade-up");
  const qWord = t("train_questions");
  const cards = [
    { icon: "📚", t: t("train_themes"), d: `${themes.length} · ${themes.reduce((s,x)=>s+x.count,0)} ${qWord}`, data: themes, lime: false, kind: "theme" },
    { icon: "🎟", t: t("train_tickets"), d: `${tickets.length} · ${tickets.reduce((s,x)=>s+x.count,0)} ${qWord}`, data: tickets, lime: true, kind: "ticket" },
    { icon: "📝", t: t("train_exam"), d: `${exam.count} ${qWord}`, data: [exam], lime: false, kind: "exam" },
    { icon: "🏃", t: t("train_marathon"), d: `${marathon.count} ${qWord}`, data: [marathon], lime: true, kind: "marathon" },
    { icon: "🧠", t: t("train_tricky"), d: `${tricky.count} ${qWord}`, data: [tricky], lime: false, kind: "tricky" },
  ];
  cards.forEach((c) => {
    const card = el("div", `feature-card ${c.lime ? "lime" : ""}`);
    card.innerHTML = `<div class="icon">${c.icon}</div><h3>${esc(c.t)}</h3><p>${esc(c.d)}</p><div class="arrow">→</div>`;
    card.onclick = () => renderList(c.kind, c.data, c.t);
    grid.appendChild(card);
  });
  frag.appendChild(grid);
  setApp(frag);
}

/* ── Список тем/билетов внутри секции ──────────────────────────── */
function renderList(kind, items, sectionTitle) {
  const frag = document.createDocumentFragment();
  frag.appendChild(backBtn(t("to_training"), "training"));
  frag.appendChild(head(`${t("nav_training")} / ${sectionTitle}`, sectionTitle, t("train_choose")));

  const grid = el("div", "list-grid");
  frag.appendChild(grid);

  items.forEach((item, i) => {
    const li = el("div", `list-item fade-up ${i % 2 === 0 ? "lime" : ""}`);
    const num = kind === "ticket"
      ? `Б${item.name.replace(/\D/g, "")}`
      : (i + 1);
    li.innerHTML = `
      <div class="li-num">${esc(num)}</div>
      <div>
        <div class="li-title">${esc(item.name)}</div>
        <div class="li-meta">${item.count} ${t("train_questions")} · ${t("train_start")}</div>
      </div>`;
    li.onclick = () => go("quiz", { kind, items, index: i, title: item.name });
    grid.appendChild(li);
  });
  setApp(frag);
}

/* ═══════════════════════════════════════════════════════════════
   ВИКТОРИНА (тест)
   ═══════════════════════════════════════════════════════════════ */
let quizState = null;

async function renderQuiz(param) {
  // param: { kind, items, index, title }
  const set = param.items[param.index];
  const questions = set.questions;
  quizState = { set, questions, current: 0, correct: 0, answered: false, kind: param.kind };

  const frag = document.createDocumentFragment();
  frag.appendChild(backBtn(t("back"), "training"));

  const card = el("div", "q-card");
  frag.appendChild(card);

  const bar = el("div", "quiz-bar fade-up");
  bar.innerHTML = `
    <div class="quiz-progress"><div class="fill" id="qFill"></div></div>
    <div class="quiz-score" id="qScore">0 / ${questions.length}</div>`;
  frag.appendChild(bar);

  setApp(frag);
  renderQuestion(card);
}

function renderQuestion(card) {
  const st = quizState;
  const q = st.questions[st.current];
  st.answered = false;

  card.innerHTML = `
    <div class="panel fade-up">
      <div class="muted" style="font-size:0.82rem;font-weight:700;margin-bottom:10px">
        ${t("quiz_question")} ${st.current + 1} ${t("quiz_of")} ${st.questions.length}
      </div>
      <h3 style="font-size:1.2rem;line-height:1.4">${esc(q.question)}</h3>
      ${q.image ? `<img class="q-img" src="${esc(q.image)}" alt="" onerror="this.style.display='none'">` : ""}
      <div class="q-options" id="qOptions"></div>
      <div id="qExplain"></div>
      <div class="q-nav" id="qNav"></div>
    </div>`;

  const optsEl = card.querySelector("#qOptions");
  q.options.forEach((o, i) => {
    const opt = el("div", "q-option");
    opt.innerHTML = `<div class="letter">${String.fromCharCode(65 + i)}</div><div>${esc(o.text)}</div>`;
    opt.onclick = () => selectAnswer(opt, o, i);
    optsEl.appendChild(opt);
  });
  updateBar();
}

function selectAnswer(optEl, option, idx) {
  const st = quizState;
  if (st.answered) return;
  st.answered = true;

  const opts = document.querySelectorAll("#qOptions .q-option");
  opts.forEach((o) => o.classList.add("disabled"));
  optEl.classList.add(option.correct ? "correct" : "wrong");

  if (option.correct) {
    st.correct++;
  } else {
    // показать правильный
    const q = st.questions[st.current];
    q.options.forEach((o, i) => {
      if (o.correct) opts[i]?.classList.add("correct");
    });
  }

  // объяснение
  const q = st.questions[st.current];
  const expEl = document.getElementById("qExplain");
  if (q.explanation) {
    expEl.innerHTML = `<div class="q-explain"><strong>${t("quiz_explanation")}</strong> ${esc(q.explanation)}</div>`;
  }

  // навигация
  const nav = document.getElementById("qNav");
  const isLast = st.current + 1 >= st.questions.length;
  if (isLast) {
    nav.innerHTML = `<div></div><button class="btn btn-lime" id="qFinish">${t("quiz_result")}</button>`;
    document.getElementById("qFinish").onclick = showResult;
  } else {
    nav.innerHTML = `<div></div><button class="btn btn-primary" id="qNext">${t("quiz_next")}</button>`;
    document.getElementById("qNext").onclick = () => { st.current++; renderQuestion(document.querySelector(".q-card")); };
  }
  updateBar();
}

function updateBar() {
  const st = quizState;
  const fill = document.getElementById("qFill");
  const score = document.getElementById("qScore");
  if (fill) fill.style.width = `${((st.current + (st.answered ? 1 : 0)) / st.questions.length) * 100}%`;
  if (score) score.textContent = `${st.correct} / ${st.questions.length}`;
}

function showResult() {
  const st = quizState;
  const pct = Math.round((st.correct / st.questions.length) * 100);
  const passed = pct >= 80;

  // Отправить прогресс викторины на сервер.
  // Для тем/билетов передаём categoryKind + id набора, чтобы засчитать его пройденным.
  const param = currentParam || {};
  const categoryKind = param.kind; // "theme" | "ticket" | "exam" | "tricky" | "marathon"
  apiProgress(categoryKind === "exam" ? "exam" : "quiz", param.index, {
    correct: st.correct,
    total: st.questions.length,
    categoryKind,
  });
  const card = document.querySelector(".q-card");
  card.innerHTML = `
    <div class="panel fade-up center" style="padding:48px 24px">
      <div style="font-size:4rem;margin-bottom:8px">${passed ? "🎉" : "💪"}</div>
      <h2>${passed ? t("quiz_great") : t("quiz_keep")}</h2>
      <div style="font-size:3rem;font-weight:900;color:var(--navy);margin:20px 0">${pct}%</div>
      <p style="font-size:1.1rem;margin-bottom:8px">${t("quiz_correct_of")} <strong>${st.correct} / ${st.questions.length}</strong></p>
      <p class="muted" style="margin-bottom:28px">${passed ? t("quiz_ready_exam") : ""}</p>
      <div class="row" style="justify-content:center">
        <button class="btn btn-ghost" onclick="go('training')">${t("quiz_to_train")}</button>
        <button class="btn btn-lime" id="rRetry">${t("quiz_retry")}</button>
      </div>
    </div>`;
  document.getElementById("rRetry").onclick = () => go("quiz", { kind: st.kind, items: [st.set], index: 0, title: st.set.name });
  // скрыть бар
  const bar = document.querySelector(".quiz-bar");
  if (bar) bar.style.display = "none";
}

/* ═══════════════════════════════════════════════════════════════
   АРЕНА (Octagon 1v1 + лидерборд экзаменов)
   ═══════════════════════════════════════════════════════════════ */
async function renderArena() {
  const [octagon, examLb] = await Promise.all([load("octagon"), load("exam-leaderboard")]);
  const frag = document.createDocumentFragment();
  frag.appendChild(head(`${t("nav_home")} / ${t("nav_arena")}`, t("arena_title"), t("arena_sub")));

  // Octagon hero
  const hero = el("div", "octagon-hero fade-up");
  hero.innerHTML = `
    <div class="emoji">⚔️</div>
    <h2>${t("arena_octagon").split("—")[0]}— <span class="l">1v1</span></h2>
    <p>${t("arena_octagon_d")}</p>
    <div class="octagon-vs">
      <div class="octagon-player me"><div class="pa">${t("home_greeting")}</div><div style="font-size:0.8rem;font-weight:700">${t("home_greeting")}</div></div>
      <div class="vs">VS</div>
      <div class="octagon-player opp"><div class="pa">🤖</div><div style="font-size:0.8rem;font-weight:700">🤖</div></div>
    </div>
    <button class="btn btn-lime" onclick="go('training')">${t("home_cta_train")} →</button>`;
  frag.appendChild(hero);

  // Лидерборд Octagon
  if (octagon && octagon.leaderboard && octagon.leaderboard.length) {
    frag.appendChild(head("Octagon", t("arena_top_week"), t("arena_top_week_d")));
    frag.appendChild(renderLeaderboard(octagon.leaderboard, "octagon"));
  }

  frag.appendChild(el("div", "divider-glow"));

  // Лидерборд экзаменов
  if (examLb && examLb.leaderboard && examLb.leaderboard.length) {
    frag.appendChild(head(t("train_exam"), t("arena_best_exam"), `${esc(examLb.week || "")}`));
    frag.appendChild(renderLeaderboard(examLb.leaderboard, "exam"));
  }

  setApp(frag);
}

/* ── Рендер лидерборда (универсальный) ─────────────────────────── */
function renderLeaderboard(list, type) {
  const lb = el("div", "leaderboard");
  list.slice(0, 20).forEach((u, i) => {
    const row = el("div", `lb-row fade-up ${i < 3 ? "podium" : ""}`);
    const initials = (u.name || "?").split(" ").map(w => w[0]).slice(0,2).join("").toUpperCase();
    const avatar = u.photo
      ? `<img class="lb-avatar" src="${esc(u.photo)}" alt="" onerror="this.outerHTML='<div class=&quot;lb-avatar&quot;>${esc(initials)}</div>'">`
      : `<div class="lb-avatar">${esc(initials)}</div>`;
    const tierClass = u.tier === "crimson" ? "crimson" : u.tier === "gold" ? "gold" : u.tier === "silver" ? "silver" : "";

    let stats = "";
    if (type === "octagon") {
      stats = `<div class="lb-stats">
        <div class="lb-stat"><div class="val">${u.weeklyPoints || 0}</div><div class="lbl">${t("arena_points")}</div></div>
        <div class="lb-stat"><div class="val">${u.totalWins || 0}</div><div class="lbl">${t("arena_wins")}</div></div>
        <div class="lb-stat"><div class="val">${u.winRate || 0}%</div><div class="lbl">${t("arena_winrate")}</div></div>
      </div>`;
    } else {
      const mm = Math.floor((u.timeSeconds || 0) / 60);
      const ss = String((u.timeSeconds || 0) % 60).padStart(2, "0");
      stats = `<div class="lb-stats">
        <div class="lb-stat"><div class="val">${mm}:${ss}</div><div class="lbl">${t("arena_time")}</div></div>
        <div class="lb-stat"><div class="val">${u.correctCount || 0}/20</div><div class="lbl">${t("arena_correct")}</div></div>
      </div>`;
    }
    row.innerHTML = `
      <div class="lb-rank">${i < 3 ? ["🥇","🥈","🥉"][i] : (i + 1)}</div>
      ${avatar}
      <div>
        <div class="lb-name">${esc(u.name || "Игрок")}</div>
        ${u.title ? `<div class="lb-title ${tierClass}">${esc(u.title)}</div>` : ""}
      </div>
      ${stats}`;
    lb.appendChild(row);
  });
  return lb;
}

/* ═══════════════════════════════════════════════════════════════
   ПРОФИЛЬ (как на оригинале)
   ═══════════════════════════════════════════════════════════════ */
const LANG_OPTIONS = [
  { id: "uz", label: "O'zbekcha" },
  { id: "oz", label: "Ўзбекча" },
  { id: "ru", label: "Русский" },
];

async function renderProfile() {
  const u = currentUser;
  if (!u) { go("home"); return; }

  // Свежие данные + готовность + список званий (гость — всё локально)
  let readiness = null, titles = [];
  if (guestMode) {
    readiness = guestReadiness();
    titles = [{ id: "Новичок", label: "🌱 Новичок" }, { id: "Ученик", label: "📚 Ученик" },
      { id: "Знаток", label: "💡 Знаток" }, { id: "Мастер", label: "⭐ Мастер" },
      { id: "Профи", label: "🏆 Профи" }, { id: "Легенда", label: "👑 Легенда" }];
  } else {
    try {
      const [r1, r2] = await Promise.all([fetch("/api/readiness"), fetch("/api/titles")]);
      const d1 = await r1.json(); if (d1.ok) readiness = d1.readiness;
      const d2 = await r2.json(); if (d2.ok) titles = d2.titles;
    } catch {}
  }

  const s = u.stats || {};
  const initials = (u.name || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const memberSince = new Date(u.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const accuracy = (s.totalAnswers || 0) > 0 ? Math.round((s.correctAnswers / s.totalAnswers) * 100) : 0;

  const frag = document.createDocumentFragment();
  frag.appendChild(head(t("profile_title"), t("profile_title"), t("profile_sub")));

  // ── Hero карточка (гостю — без email/кнопки выхода) ──────────────
  const heroCard = el("div", "panel fade-up profile-hero");
  heroCard.innerHTML = `
    <div class="ph-top">
      <div class="ph-avatar">${esc(initials)}</div>
      <div class="ph-main">
        <h2 class="ph-name" id="phName">${esc(u.name)}</h2>
        ${guestMode ? `<div class="ph-email">👤 ${t("home_greeting")} · ${t("profile_progress")} — localStorage</div>` : `<div class="ph-email">${esc(u.email)}</div>`}
        <div class="ph-since">📅 ${t("profile_member_since")} ${esc(memberSince)}</div>
      </div>
      ${guestMode ? "" : `<button class="btn btn-ghost" id="btnLogout" style="align-self:flex-start">${t("profile_logout_short")}</button>`}
    </div>`;
  frag.appendChild(heroCard);

  // ── Настройки аккаунта ──────────────────────────────────────────
  frag.appendChild(el("div", "divider-glow"));
  const settingsWrap = el("div", "fade-up");
  settingsWrap.innerHTML = `<h3 class="mb-16">${t("profile_settings")}</h3>`;
  const settings = el("div", "panel");

  // Поле: Полное имя
  settings.appendChild(profileField(t("profile_name"), `<input class="pf-input" id="fName" value="${esc(u.name)}">`));

  // Поле: Yodla ID (только чтение; гостю не показываем)
  if (!guestMode) {
    settings.appendChild(profileField(t("profile_yodla_id"), `<div class="pf-readonly">${esc(u.yodlaId || "—")}</div>`));

    // Поле: Email (только чтение)
    settings.appendChild(profileField("Email", `<div class="pf-readonly">${esc(u.email)}</div>`));
  }

  // Поле: Телефон
  settings.appendChild(profileField(t("profile_phone"), `<input class="pf-input" id="fPhone" value="${esc(u.phone || "")}" placeholder="+998 90 123 45 67">`));

  // Поле: Дата экзамена (input type=date, автосохранение)
  settings.appendChild(profileField(t("profile_exam_date"), `<input type="date" class="pf-input" id="fExamDate" value="${esc(u.examDate || "")}">`));

  // Поле: Звание (select)
  const titleOpts = (titles.length ? titles : [{ id: "Новичок", label: "🌱 Новичок" }])
    .map(t => `<option value="${esc(t.id)}" ${t.id === u.title ? "selected" : ""}>${esc(t.label)}</option>`).join("");
  settings.appendChild(profileField(t("profile_title_rank"), `<select class="pf-input" id="fTitle">${titleOpts}</select>`));

  // Поле: Язык (select)
  const langOpts = LANG_OPTIONS.map(l => `<option value="${l.id}" ${l.id === u.language ? "selected" : ""}>${esc(l.label)}</option>`).join("");
  settings.appendChild(profileField(t("profile_language"), `<select class="pf-input" id="fLanguage">${langOpts}</select>`));

  settingsWrap.appendChild(settings);
  frag.appendChild(settingsWrap);

  // ── Смена пароля (только для залогиненных) ──────────────────────
  frag.appendChild(el("div", "divider-glow"));
  const pwdWrap = el("div", "fade-up");
  if (guestMode) {
    pwdWrap.innerHTML = `<div class="panel center" style="padding:20px;color:var(--ink-mute)">${t("profile_change_pwd")} — ${t("profile_title")}</div>`;
  } else {
  pwdWrap.innerHTML = `<h3 class="mb-16">${t("profile_change_pwd")}</h3>`;
  const pwdPanel = el("div", "panel");
  pwdPanel.innerHTML = `
    <div class="pf-grid">
      <div class="pf-field"><label>${t("profile_current_pwd")}</label><input type="password" class="pf-input" id="oldPwd" placeholder="••••••"></div>
      <div class="pf-field"><label>${t("profile_new_pwd")}</label><input type="password" class="pf-input" id="newPwd" placeholder="••••••"></div>
    </div>
    <div id="pwdMsg" class="pf-msg" hidden></div>
    <button class="btn btn-primary mt-24" id="btnChangePwd">${t("profile_update_pwd")}</button>`;
  pwdWrap.appendChild(pwdPanel);
  }
  frag.appendChild(pwdWrap);

  // ── Статистика ──────────────────────────────────────────────────
  frag.appendChild(el("div", "divider-glow"));
  frag.appendChild(head(t("profile_progress"), t("profile_stats"), ""));
  const statGrid = el("div", "profile-stats fade-up");
  const cards = [
    { icon: "🎬", val: (s.videosWatched || []).length, label: `${t("ai_cat_videos")} ${getLang() === "zh" ? "已看" : ""}`.trim(), total: readiness?.breakdown?.videos?.total || 88, color: "navy" },
    { icon: "📚", val: (s.themesDone || []).length, label: t("ai_cat_themes"), total: readiness?.breakdown?.themes?.total || 42, color: "lime" },
    { icon: "🎟", val: (s.ticketsDone || []).length, label: t("ai_cat_tickets"), total: readiness?.breakdown?.tickets?.target || 64, color: "navy" },
    { icon: "🧠", val: (s.trickyMastered || []).length, label: t("ai_cat_tricky"), total: readiness?.breakdown?.tricky?.pool || 219, color: "lime" },
    { icon: "📝", val: s.quizzesTaken || 0, label: t("train_exam"), total: null, color: "navy" },
    { icon: "🎯", val: accuracy + "%", label: t("arena_winrate"), total: null, color: "lime" },
    { icon: "✅", val: s.correctAnswers || 0, label: t("quiz_correct_of").replace(":", ""), total: s.totalAnswers || 0, color: "navy" },
    { icon: "🏆", val: s.examsPassed || 0, label: t("arena_wins"), total: null, color: "lime" },
  ];
  cards.forEach((c) => {
    const card = el("div", `ps-card ${c.color}`);
    const sub = c.total != null ? `<div class="ps-sub">из ${c.total}</div>` : "";
    card.innerHTML = `<div class="ps-icon">${c.icon}</div><div class="ps-val">${esc(String(c.val))}</div><div class="ps-label">${esc(c.label)}</div>${sub}`;
    statGrid.appendChild(card);
  });
  frag.appendChild(statGrid);

  // ── AI-готовность ───────────────────────────────────────────────
  if (readiness) {
    frag.appendChild(el("div", "divider-glow"));
    frag.appendChild(renderReadinessGauge(readiness));
  }

  // ── Выход (только для залогиненных) ──────────────────────────────
  if (!guestMode) {
    const logoutRow = el("div", "center fade-up");
    logoutRow.style.marginTop = "32px";
    logoutRow.innerHTML = `<button class="btn btn-ghost" id="btnLogout2">${t("profile_logout")}</button>`;
    frag.appendChild(logoutRow);
  }

  setApp(frag);
  bindProfileEvents(u);
}

// Поле профиля: label + контент
function profileField(label, contentHtml) {
  const row = el("div", "pf-row");
  row.innerHTML = `<div class="pf-label">${esc(label)}</div><div class="pf-control">${contentHtml}</div>`;
  return row;
}

// Привязка событий автосохранения и кнопок
function bindProfileEvents(u) {
  // автосохранение при изменении (debounce)
  let saveTimer = null;
  function saveProfile(patch, msgEl) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      // Гость: сохраняем профиль локально
      if (guestMode) {
        if (typeof patch.name === "string" && patch.name.trim().length >= 2) currentUser.name = patch.name.trim();
        if ("phone" in patch) currentUser.phone = patch.phone || null;
        if ("examDate" in patch) currentUser.examDate = patch.examDate || null;
        if ("title" in patch) currentUser.title = patch.title;
        if ("language" in patch) currentUser.language = patch.language;
        try { localStorage.setItem("yodla_guest_profile", JSON.stringify({
          name: currentUser.name, phone: currentUser.phone, examDate: currentUser.examDate,
          title: currentUser.title, language: currentUser.language,
        })); } catch {}
        const navUser = document.getElementById("navUser");
        if (navUser) navUser.textContent = currentUser.name.split(" ")[0];
        const phName = document.getElementById("phName");
        if (phName) phName.textContent = currentUser.name;
        if (msgEl) { msgEl.textContent = t("profile_saved"); msgEl.className = "pf-msg ok"; msgEl.hidden = false; setTimeout(() => msgEl.hidden = true, 1500); }
        return;
      }
      try {
        const r = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
        const d = await r.json();
        if (d.ok) {
          currentUser = d.user;
          // обновить имя в навигации и hero
          const navUser = document.getElementById("navUser");
          if (navUser) navUser.textContent = d.user.name.split(" ")[0];
          const phName = document.getElementById("phName");
          if (phName) phName.textContent = d.user.name;
          if (msgEl) { msgEl.textContent = t("profile_saved"); msgEl.className = "pf-msg ok"; msgEl.hidden = false; setTimeout(() => msgEl.hidden = true, 1500); }
        }
      } catch {}
    }, 500);
  }

  // имя
  const fName = document.getElementById("fName");
  if (fName) fName.addEventListener("input", () => saveProfile({ name: fName.value }));
  // телефон
  const fPhone = document.getElementById("fPhone");
  if (fPhone) fPhone.addEventListener("input", () => saveProfile({ phone: fPhone.value }));
  // дата экзамена — автосохранение сразу при выборе
  const fExamDate = document.getElementById("fExamDate");
  if (fExamDate) fExamDate.addEventListener("change", () => saveProfile({ examDate: fExamDate.value }));
  // звание
  const fTitle = document.getElementById("fTitle");
  if (fTitle) fTitle.addEventListener("change", () => saveProfile({ title: fTitle.value }));
  // язык — мгновенная смена интерфейса
  const fLanguage = document.getElementById("fLanguage");
  if (fLanguage) fLanguage.addEventListener("change", () => {
    setLang(fLanguage.value);
    saveProfile({ language: fLanguage.value });
    translateNav();
    // перерисовать профиль на новом языке
    setTimeout(() => go("profile"), 300);
  });

  // смена пароля
  const btnPwd = document.getElementById("btnChangePwd");
  if (btnPwd) btnPwd.addEventListener("click", async () => {
    const oldP = document.getElementById("oldPwd").value;
    const newP = document.getElementById("newPwd").value;
    const msg = document.getElementById("pwdMsg");
    if (!oldP || !newP) { msg.textContent = t("profile_fill_both"); msg.className = "pf-msg err"; msg.hidden = false; return; }
    btnPwd.disabled = true;
    try {
      const r = await fetch("/api/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ oldPassword: oldP, newPassword: newP }) });
      const d = await r.json();
      if (d.ok) { msg.textContent = t("profile_pwd_changed"); msg.className = "pf-msg ok"; document.getElementById("oldPwd").value = ""; document.getElementById("newPwd").value = ""; }
      else msg.textContent = "✗ " + (d.error || "Error"); msg.className = "pf-msg err";
      msg.hidden = false;
    } catch { msg.textContent = t("profile_net_err"); msg.className = "pf-msg err"; msg.hidden = false; }
    btnPwd.disabled = false;
  });

  // выходы
  document.getElementById("btnLogout")?.addEventListener("click", doLogout);
  document.getElementById("btnLogout2")?.addEventListener("click", doLogout);
}

/* ── запуск ──────────────────────────────────────────────────────
   Сначала проверяем сессию. Если не залогинен — редирект на /login. */
(async () => {
  await checkSession();
  // Гость: создаём локального пользователя, прогресс хранится в localStorage
  if (!currentUser) {
    const GUEST = {
      id: "guest", yodlaId: null, name: "Гость", email: "",
      phone: null, examDate: null, title: "Новичок", language: null,
      createdAt: new Date().toISOString(),
      stats: loadGuestStats(),
    };
    // восстановить сохранённый локально guest-профиль (имя/телефон/дата/звание/язык)
    try {
      const gp = JSON.parse(localStorage.getItem("yodla_guest_profile"));
      if (gp) Object.assign(GUEST, gp);
    } catch {}
    currentUser = GUEST;
    guestMode = true;
  } else if (currentUser.language) {
    setLang(currentUser.language);
  }
  translateNav();
  const navUser = document.getElementById("navUser");
  if (navUser) {
    navUser.textContent = currentUser.name.split(" ")[0];
    navUser.onclick = () => go("profile");
  }
  const navSearch = document.getElementById("navSearch");
  if (navSearch) navSearch.onclick = showSearch;
  const navLang = document.getElementById("navLang");
  if (navLang) navLang.onclick = showLangModal;
  go("home");
})();
