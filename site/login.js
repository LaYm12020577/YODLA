// login.js — логика страницы входа/регистрации.
"use strict";

let mode = "login"; // или "register"

const form = document.getElementById("authForm");
const nameField = document.getElementById("nameField");
const submitBtn = document.getElementById("submitBtn");
const submitLabel = submitBtn.querySelector(".btn-label");
const errorEl = document.getElementById("authError");
const hint = document.getElementById("authHint");
const switchLink = document.getElementById("switchLink");

function setMode(m) {
  mode = m;
  document.querySelectorAll(".auth-tab").forEach((t) => t.classList.toggle("active", t.dataset.mode === m));
  nameField.hidden = m !== "register";
  submitLabel.textContent = m === "login" ? "Войти" : "Создать аккаунт";
  hint.innerHTML = m === "login"
    ? 'Нет аккаунта? <a data-mode="register">Зарегистрироваться</a>'
    : 'Уже есть аккаунт? <a data-mode="login">Войти</a>';
  // перепривязать ссылку
  document.querySelector("#authHint a").onclick = () => setMode(document.querySelector("#authHint a").dataset.mode);
  errorEl.hidden = true;
}

// клики по табам
document.querySelectorAll(".auth-tab").forEach((t) => t.onclick = () => setMode(t.dataset.mode));
switchLink.onclick = () => setMode(switchLink.dataset.mode);

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.hidden = true;

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const name = document.getElementById("name").value.trim();

  const payload = { email, password };
  if (mode === "register") payload.name = name;

  // спиннер
  submitBtn.disabled = true;
  const oldLabel = submitLabel.textContent;
  submitLabel.innerHTML = '<span class="spinner"></span>';

  try {
    const endpoint = mode === "login" ? "/api/login" : "/api/register";
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (data.ok) {
      // успех — редирект на главную
      window.location.href = "/";
    } else {
      showError(data.error || "Что-то пошло не так. Попробуйте снова.");
    }
  } catch (err) {
    showError("Не удалось связаться с сервером.");
  } finally {
    submitBtn.disabled = false;
    submitLabel.textContent = oldLabel;
  }
});

// При старте: если уже залогинен — сразу на главную
fetch("/api/me").then((r) => r.json()).then((d) => { if (d.ok) window.location.href = "/"; }).catch(() => {});
