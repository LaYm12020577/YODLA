// player.js — собственный видеоплеер в стиле YouTube.
// Самостоятельная реализация: свои элементы управления поверх <video>,
// без нативных контролов. Защита от скачивания встроена.
//
// Создание:  const p = new YPlayer(container, { src, poster, startTime });
// События:   p.on("position", sec => ...);  // для синхронизации с аккаунтом
"use strict";

class YPlayer {
  constructor(container, opts = {}) {
    this.container = typeof container === "string" ? document.querySelector(container) : container;
    this.opts = opts;
    this.listeners = {};
    this.hideTimer = null;
    this.render();
    this.bind();
    if (opts.startTime > 5) this.pendingSeek = opts.startTime;
  }

  on(evt, fn) { (this.listeners[evt] = this.listeners[evt] || []).push(fn); }
  emit(evt, data) { (this.listeners[evt] || []).forEach((f) => f(data)); }

  render() {
    this.container.innerHTML = `
      <div class="yp-root">
        <video class="yp-video"
          preload="metadata"
          playsinline
          disablepictureinpicture
          disableremoteplayback
          controlslist="nodownload noplaybackrate"
          oncontextmenu="return false"></video>

        <!-- Большая кнопка play по центру -->
        <div class="yp-bigplay">▶</div>

        <!-- Контролы (появляются/исчезают) -->
        <div class="yp-controls">
          <!-- Прогресс-бар -->
          <div class="yp-progress" tabindex="0">
            <div class="yp-progress-buffer"></div>
            <div class="yp-progress-played"></div>
            <div class="yp-progress-handle"></div>
          </div>

          <div class="yp-bar">
            <div class="yp-left">
              <button class="yp-btn yp-play" title="Play/Pause">▶</button>
              <div class="yp-volume">
                <button class="yp-btn yp-mute" title="Громкость">🔊</button>
                <div class="yp-vol-track" tabindex="0">
                  <div class="yp-vol-fill"></div>
                </div>
              </div>
              <div class="yp-time"><span class="yp-cur">0:00</span> / <span class="yp-dur">0:00</span></div>
            </div>
            <div class="yp-right">
              <button class="yp-btn yp-speed" title="Скорость">1x</button>
              <button class="yp-btn yp-fs" title="Полный экран">⛶</button>
            </div>
          </div>
        </div>
      </div>`;

    this.root = this.container.querySelector(".yp-root");
    this.video = this.container.querySelector(".yp-video");
    this.bigPlay = this.container.querySelector(".yp-bigplay");
    this.controls = this.container.querySelector(".yp-controls");
    this.playBtn = this.container.querySelector(".yp-play");
    this.muteBtn = this.container.querySelector(".yp-mute");
    this.volTrack = this.container.querySelector(".yp-vol-track");
    this.volFill = this.container.querySelector(".yp-vol-fill");
    this.curEl = this.container.querySelector(".yp-cur");
    this.durEl = this.container.querySelector(".yp-dur");
    this.progBar = this.container.querySelector(".yp-progress");
    this.progPlayed = this.container.querySelector(".yp-progress-played");
    this.progBuffer = this.container.querySelector(".yp-progress-buffer");
    this.progHandle = this.container.querySelector(".yp-progress-handle");
    this.speedBtn = this.container.querySelector(".yp-speed");
    this.fsBtn = this.container.querySelector(".yp-fs");

    if (this.opts.src) this.video.src = this.opts.src;
    if (this.opts.poster) this.video.poster = this.opts.poster;
  }

  bind() {
    const v = this.video;

    // ── воспроизведение / пауза ──────────────────────────────────
    const togglePlay = () => (v.paused ? v.play() : v.pause());
    this.bigPlay.onclick = togglePlay;
    this.playBtn.onclick = togglePlay;
    this.root.onclick = (e) => {
      if (e.target === this.video || e.target === this.bigPlay || e.target === this.root.querySelector(".yp-root")) togglePlay();
    };

    // обновление интерфейса при play/pause
    v.addEventListener("play", () => { this.bigPlay.classList.add("hidden"); this.playBtn.textContent = "❚❚"; });
    v.addEventListener("pause", () => { this.bigPlay.classList.remove("hidden"); this.playBtn.textContent = "▶"; });

    // ── метаданные: длительность + восстановление позиции ─────────
    v.addEventListener("loadedmetadata", () => {
      this.durEl.textContent = fmt(v.duration);
      if (this.pendingSeek && this.pendingSeek < v.duration - 5) {
        v.currentTime = this.pendingSeek;
        this.pendingSeek = null;
      }
    });

    // ── ход времени: прогресс + таймер скрытия + синхро ───────────
    let lastEmit = 0;
    v.addEventListener("timeupdate", () => {
      const pct = v.duration ? (v.currentTime / v.duration) * 100 : 0;
      this.progPlayed.style.width = pct + "%";
      this.progHandle.style.left = pct + "%";
      this.curEl.textContent = fmt(v.currentTime);
      // отправлять позицию наружу ~раз в 5 сек
      const now = Date.now();
      if (now - lastEmit > 5000) { lastEmit = now; this.emit("position", Math.floor(v.currentTime)); }
    });

    // ── буфер ──────────────────────────────────────────────────────
    v.addEventListener("progress", () => {
      if (v.buffered.length && v.duration) {
        const end = v.buffered.end(v.buffered.length - 1);
        this.progBuffer.style.width = (end / v.duration) * 100 + "%";
      }
    });

    // ── перемотка по прогресс-бару (клик + драг) ───────────────────
    const seekTo = (clientX) => {
      const r = this.progBar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      if (v.duration) v.currentTime = ratio * v.duration;
    };
    let dragging = false;
    this.progBar.addEventListener("mousedown", (e) => { dragging = true; seekTo(e.clientX); });
    document.addEventListener("mousemove", (e) => { if (dragging) seekTo(e.clientX); });
    document.addEventListener("mouseup", () => { dragging = false; });

    // ── громкость ──────────────────────────────────────────────────
    const setVol = (clientX) => {
      const r = this.volTrack.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      v.volume = ratio; v.muted = ratio === 0;
      this.volFill.style.width = ratio * 100 + "%";
      this.muteBtn.textContent = ratio === 0 ? "🔇" : ratio < 0.5 ? "🔉" : "🔊";
    };
    this.volFill.style.width = "100%";
    let volDrag = false;
    this.volTrack.addEventListener("mousedown", (e) => { volDrag = true; setVol(e.clientX); });
    document.addEventListener("mousemove", (e) => { if (volDrag) setVol(e.clientX); });
    document.addEventListener("mouseup", () => { volDrag = false; });
    this.muteBtn.onclick = () => {
      v.muted = !v.muted;
      this.muteBtn.textContent = v.muted ? "🔇" : "🔊";
      this.volFill.style.width = v.muted ? "0%" : v.volume * 100 + "%";
    };

    // ── скорость ───────────────────────────────────────────────────
    const speeds = [1, 1.25, 1.5, 2];
    let speedIdx = 0;
    this.speedBtn.onclick = () => {
      speedIdx = (speedIdx + 1) % speeds.length;
      v.playbackRate = speeds[speedIdx];
      this.speedBtn.textContent = speeds[speedIdx] + "x";
    };

    // ── полный экран ───────────────────────────────────────────────
    this.fsBtn.onclick = () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else this.root.requestFullscreen?.();
    };

    // ── скрытие контролов при бездействии ──────────────────────────
    const showControls = () => {
      this.controls.classList.add("visible");
      clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => {
        if (!v.paused) this.controls.classList.remove("visible");
      }, 2800);
    };
    this.root.addEventListener("mousemove", showControls);
    this.root.addEventListener("mouseleave", () => { if (!v.paused) this.controls.classList.remove("visible"); });

    // ── клавиатура (пробел = play/pause, ←/→ перемотка) ────────────
    this.root.tabIndex = 0;
    this.root.addEventListener("keydown", (e) => {
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      else if (e.code === "ArrowRight") v.currentTime += 5;
      else if (e.code === "ArrowLeft") v.currentTime -= 5;
    });

    // ── защита от скачивания ───────────────────────────────────────
    // отключить контекстное меню (правый клик) на видео
    v.addEventListener("contextmenu", (e) => e.preventDefault());
    // блокировать перетаскивание
    v.addEventListener("dragstart", (e) => e.preventDefault());
  }
}

// Формат времени M:SS
function fmt(sec) {
  if (!sec || !isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return m + ":" + s;
}

window.YPlayer = YPlayer;
