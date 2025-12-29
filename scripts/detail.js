// public/js/detail.js (hoặc ./scripts/detail.js tùy bạn đặt)
// ✅ JWT protected: /auth/user/:id + /auth/update

const API_BASE = "https://f-locker-backend.onrender.com";

function getToken() {
  return sessionStorage.getItem("token");
}

function getSessionUser() {
  const raw = sessionStorage.getItem("user");
  return raw ? JSON.parse(raw) : null;
}

function getUserId(u) {
  return u ? String(u.id || u._id || "") : "";
}

async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = new Headers(options.headers || {});

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const token = getToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(url, { ...options, headers });
  return res;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text ?? "";
}

function setValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? "";
}

async function loadDetail() {
  const token = getToken();
  const sessionUser = getSessionUser();

  if (!token || !sessionUser) {
    alert("⚠️ Bạn cần đăng nhập lại (thiếu token).");
    window.location.href = "./logon.html";
    return;
  }

  const userId = getUserId(sessionUser);
  if (!userId) {
    alert("⚠️ Không tìm thấy userId trong session.");
    window.location.href = "./logon.html";
    return;
  }

  const res = await apiFetch(`/auth/user/${userId}`, { method: "GET" });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    alert(`❌ Không tải được user: ${data?.error || res.status}`);
    return;
  }

  const u = data.user || data?.data?.user || data;
  if (!u) {
    alert("❌ Response user không hợp lệ.");
    return;
  }

  // ✅ render ra UI (tùy id element của bạn)
  setText("detailNameText", u.name);
  setText("detailEmailText", u.email);
  setText("detailPhoneText", u.phone || "");
  setText("detailHintText", u.hint || "");
  setText("detailLockerCodeText", u.lockerCode ?? "Chưa thiết lập");
  setText("detailRegisteredLockerText", u.registeredLocker ?? "Chưa đăng ký");

  // ✅ nếu bạn có input edit
  setValue("nameInput", u.name);
  setValue("phoneInput", u.phone || "");
  setValue("hintInput", u.hint || "");
  setValue("lockerCodeInput", u.lockerCode || "");

  // ✅ sync session user
  sessionStorage.setItem("user", JSON.stringify(u));
}

async function saveDetail() {
  const token = getToken();
  const sessionUser = getSessionUser();
  if (!token || !sessionUser) {
    alert("⚠️ Missing token. Hãy đăng nhập lại.");
    window.location.href = "./logon.html";
    return;
  }

  const userId = getUserId(sessionUser);
  if (!userId) {
    alert("⚠️ Không tìm thấy userId.");
    return;
  }

  // lấy input
  const name = document.getElementById("nameInput")?.value?.trim();
  const phone = document.getElementById("phoneInput")?.value?.trim();
  const hint = document.getElementById("hintInput")?.value?.trim();
  const lockerCode = document.getElementById("lockerCodeInput")?.value?.trim();

  // nếu bạn có đổi password
  const password = document.getElementById("passwordInput")?.value?.trim();

  const payload = {
    id: userId,
    ...(name !== undefined ? { name } : {}),
    ...(phone !== undefined ? { phone } : {}),
    ...(hint !== undefined ? { hint } : {}),
    ...(lockerCode !== undefined ? { lockerCode } : {}),
    ...(password ? { password } : {}),
  };

  const res = await apiFetch("/auth/update", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    alert(`❌ Update thất bại: ${data?.error || res.status}`);
    return;
  }

  const updatedUser = data.user || data?.data?.user;
  if (updatedUser) {
    sessionStorage.setItem("user", JSON.stringify(updatedUser));
  }

  alert("✅ Lưu thay đổi thành công!");
  await loadDetail();
}

document.addEventListener("DOMContentLoaded", () => {
  // nút save (đúng id của bạn)
  const btn = document.getElementById("saveBtn");
  if (btn) btn.addEventListener("click", (e) => {
    e.preventDefault();
    saveDetail();
  });

  loadDetail();
});
