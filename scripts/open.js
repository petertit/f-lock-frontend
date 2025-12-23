// open.js
// Dùng cho open.html (grid), đồng thời expose hàm cho index.html (slider) dùng chung.

import { API_BASE } from "../api/api.js";
const API = API_BASE;

// ====== AUTH TOKEN (B3) ======
function getToken() {
  return sessionStorage.getItem("token");
}
function clearAuthAndGoLogin() {
  sessionStorage.removeItem("token");
  sessionStorage.removeItem("user");
  alert("⚠️ Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  window.location.href = "./logon.html";
}

/**
 * Fetch wrapper: tự gắn Bearer token, handle 401.
 * @param {string} path  '/lockers/status'
 * @param {RequestInit} options
 */
async function apiFetch(path, options = {}) {
  const url = `${API}${path}`;
  const token = getToken();

  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url, { ...options, headers });

  // ✅ Token hết hạn / sai
  if (res.status === 401) {
    clearAuthAndGoLogin();
    throw new Error("Unauthorized");
  }
  return res;
}

// ====== USER (đúng & an toàn) ======
const userRaw = sessionStorage.getItem("user");
const currentUser = userRaw ? JSON.parse(userRaw) : null;
const currentUserId = currentUser
  ? String(currentUser._id || currentUser.id)
  : null;

// Locker states cache: { "01": {status:"EMPTY|LOCKED|OPEN", userId:"..."} }
let lockerStates = {};

// endpoint update user (tùy backend mount kiểu nào)
const USER_UPDATE_ENDPOINTS = ["/auth/update", "/update", "/account/update"];

// ====== Helpers ======
function isOpenPage() {
  const p = window.location.pathname.toLowerCase();
  return p.includes("open");
}

function normalizeId(id) {
  if (id == null) return null;
  return String(id);
}

function getMyLockerFromDB() {
  if (!currentUserId) return null;
  const uid = normalizeId(currentUserId);
  for (const [lockerId, st] of Object.entries(lockerStates)) {
    if (normalizeId(st.userId) === uid) return lockerId;
  }
  return null;
}

function getMyLockerFromUser() {
  const v = currentUser?.registeredLocker;
  if (typeof v === "string" && /^\d{2}$/.test(v)) return v;
  return null;
}

async function updateUserField(field, value) {
  if (!currentUserId) return false;

  for (const ep of USER_UPDATE_ENDPOINTS) {
    try {
      const res = await apiFetch(ep, {
        method: "POST",
        body: JSON.stringify({ id: currentUserId, [field]: value }),
      });

      if (res.status === 404) continue;

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.user) {
        sessionStorage.setItem("user", JSON.stringify(data.user));
        Object.assign(currentUser, data.user);
        return true;
      }

      console.warn("updateUserField failed:", ep, data?.error || res.status);
      return false;
    } catch (e) {
      console.warn("updateUserField error:", ep, e.message);
    }
  }

  // fallback: update session để UI chạy, tránh block
  const updated = { ...(currentUser || {}), [field]: value };
  sessionStorage.setItem("user", JSON.stringify(updated));
  if (currentUser) Object.assign(currentUser, updated);
  return true;
}

function applyStateStyle(el, state, isMine) {
  el.classList.remove(
    "status-empty",
    "status-locked",
    "status-open",
    "status-other"
  );
  el.style.outline = "";
  el.style.border = "";
  el.style.backgroundColor = "";
  el.style.opacity = "1";

  if (state.status === "EMPTY") {
    el.classList.add("status-empty");
    return;
  }

  if (isMine) {
    if (state.status === "LOCKED") {
      el.classList.add("status-locked");
      el.style.border = "2px solid #ffd000"; // vàng
      el.style.backgroundColor = "rgba(255, 208, 0, 0.18)";
    } else if (state.status === "OPEN") {
      el.classList.add("status-open");
      el.style.border = "2px solid #00ff66"; // xanh lá
      el.style.backgroundColor = "rgba(0, 255, 102, 0.14)";
    } else {
      el.classList.add("status-locked");
      el.style.border = "2px solid #ffd000";
      el.style.backgroundColor = "rgba(255, 208, 0, 0.18)";
    }
  } else {
    el.classList.add("status-other");
    el.style.border = "2px solid #ff2a2a"; // đỏ
    el.style.backgroundColor = "rgba(255, 42, 42, 0.16)";
    el.style.opacity = "0.85";
  }
}

function addHoverButton(el, { text, bg, color, onClick }) {
  el.querySelectorAll(".hover-action-btn").forEach((b) => b.remove());

  const btn = document.createElement("button");
  btn.className = "hover-action-btn";
  btn.type = "button";
  btn.textContent = text;

  btn.style.position = "absolute";
  btn.style.left = "50%";
  btn.style.bottom = "10px";
  btn.style.transform = "translateX(-50%)";
  btn.style.zIndex = "10";
  btn.style.padding = "6px 10px";
  btn.style.borderRadius = "8px";
  btn.style.border = "0";
  btn.style.cursor = "pointer";
  btn.style.background = bg;
  btn.style.color = color;

  btn.style.opacity = "0";
  btn.style.visibility = "hidden";
  btn.style.transition = "opacity 0.2s ease";

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick?.();
  });

  el.appendChild(btn);

  el.addEventListener("mouseenter", () => {
    btn.style.visibility = "visible";
    btn.style.opacity = "1";
  });
  el.addEventListener("mouseleave", () => {
    btn.style.visibility = "hidden";
    btn.style.opacity = "0";
  });
}

// ====== API calls (B3: dùng apiFetch) ======
async function fetchLockerStates() {
  const res = await apiFetch("/lockers/status", { method: "GET" });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  if (!data.success || !Array.isArray(data.lockers)) {
    throw new Error(data?.error || "Sai cấu trúc lockers");
  }

  lockerStates = Object.fromEntries(
    data.lockers.map((l) => [
      String(l.lockerId),
      {
        status: String(l.status),
        userId: l.ownerId ? String(l.ownerId) : null,
      },
    ])
  );

  window.__lockerStates = lockerStates;
  if (typeof window.updateSliderUI === "function") {
    window.updateSliderUI(lockerStates);
  }

  return lockerStates;
}

async function updateLockerStatus(lockerId, status, ownerId) {
  const res = await apiFetch("/lockers/update", {
    method: "POST",
    body: JSON.stringify({ lockerId, status, ownerId }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }

  lockerStates[lockerId] = {
    status: data.locker.status,
    userId: data.locker.ownerId || null,
  };

  window.__lockerStates = lockerStates;
  if (typeof window.updateSliderUI === "function") {
    window.updateSliderUI(lockerStates);
  }

  return true;
}

// ====== Sync logic (tự đồng bộ) ======
async function autoSyncUserLocker() {
  if (!currentUserId) return;

  const myLockerDB = getMyLockerFromDB();
  const myLockerUser = getMyLockerFromUser();

  if (myLockerDB && myLockerUser !== myLockerDB) {
    await updateUserField("registeredLocker", myLockerDB);
    return;
  }

  if (!myLockerDB && myLockerUser) {
    await updateUserField("registeredLocker", null);
  }
}

// ====== UI (GRID) ======
function updateGridUI() {
  if (!isOpenPage()) return;

  const grid = document.querySelector(".grid-container");
  if (!grid) return;

  const uid = normalizeId(currentUserId);
  const myLockerDB = getMyLockerFromDB();
  const myLockerUser = getMyLockerFromUser();
  const myLocker = myLockerDB || myLockerUser;

  grid.querySelectorAll(".grid-item").forEach((item) => {
    const lockerId = item.dataset.lockerId;
    const state = lockerStates[lockerId] || { status: "EMPTY", userId: null };

    item.style.position = "relative";
    const isMine = uid && normalizeId(state.userId) === uid;

    applyStateStyle(item, state, isMine);

    item.querySelectorAll(".hover-action-btn").forEach((b) => b.remove());
    if (isMine && state.status !== "EMPTY") {
      addHoverButton(item, {
        text: "HỦY ĐĂNG KÝ",
        bg: "#ff8800",
        color: "#fff",
        onClick: () => handleUnregister(lockerId),
      });
    }

    if (myLocker && lockerId === myLocker) {
      item.style.outline = "2px solid rgba(255,255,255,0.25)";
      item.style.outlineOffset = "4px";
    }
  });
}

function requireLogin() {
  alert("Bạn cần đăng nhập để sử dụng chức năng này.");
  window.location.href = "./logon.html";
}

// ====== Actions ======
function handleLockerClick(lockerId) {
  if (!currentUserId) return requireLogin();

  const state = lockerStates[lockerId] || { status: "EMPTY", userId: null };

  const myLockerDB = getMyLockerFromDB();
  const myLockerUser = getMyLockerFromUser();
  const myLocker = myLockerDB || myLockerUser;

  if (state.status === "EMPTY") {
    if (myLocker && myLocker !== lockerId) {
      alert(
        `Bạn đã đăng ký tủ ${myLocker}. Hãy hủy đăng ký trước khi chọn tủ khác.`
      );
      return;
    }
    sessionStorage.setItem("locker_to_open", lockerId);
    window.location.href = "./face_log.html";
    return;
  }

  if (normalizeId(state.userId) === normalizeId(currentUserId)) {
    sessionStorage.setItem("locker_to_open", lockerId);
    window.location.href = "./face_log.html";
    return;
  }

  alert(`Tủ ${lockerId} đang được người khác sử dụng.`);
}

async function handleUnregister(lockerId) {
  if (!currentUserId) return requireLogin();

  if (
    !confirm(`Bạn có chắc muốn hủy đăng ký tủ ${lockerId}? Tủ sẽ trở về TRỐNG.`)
  )
    return;

  try {
    await updateLockerStatus(lockerId, "EMPTY", null);
    await updateUserField("registeredLocker", null);

    await fetchLockerStates();
    await autoSyncUserLocker();
    updateGridUI();

    alert(`✅ Đã hủy đăng ký tủ ${lockerId}.`);
  } catch (e) {
    console.error(e);
    alert(`❌ Hủy đăng ký thất bại: ${e.message}`);
  }
}

// callback từ face_log.html gọi về
window.openLockerSuccess = async (lockerId) => {
  if (!lockerId || !currentUserId) return;

  try {
    await updateLockerStatus(lockerId, "OPEN", currentUserId);
    await updateUserField("registeredLocker", lockerId);

    alert(`🔓 Tủ ${lockerId} đã mở!`);
    window.location.href = "./index.html";
  } catch (e) {
    alert(`❌ Mở tủ thất bại: ${e.message}`);
  }
};

window.handleLockerClick = handleLockerClick;
window.handleUnregister = handleUnregister;

// ====== Init ======
document.addEventListener("DOMContentLoaded", async () => {
  if (isOpenPage()) {
    const grid = document.querySelector(".grid-container");
    if (grid) {
      grid.addEventListener("click", (e) => {
        const item = e.target.closest(".grid-item");
        if (!item) return;
        if (e.target.closest("button")) return;

        e.preventDefault();
        handleLockerClick(item.dataset.lockerId);
      });
    }
  }

  try {
    await fetchLockerStates();
    await autoSyncUserLocker();
    updateGridUI();
  } catch (e) {
    console.error(e);
    alert("Lỗi tải chức năng tương tác tủ khóa. " + e.message);
  }
});

// poll nhẹ để “tự đồng bộ” UI nếu có người khác thao tác
setInterval(async () => {
  try {
    await fetchLockerStates();
    if (isOpenPage()) updateGridUI();
  } catch (_) {}
}, 5000);
