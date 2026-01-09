// open.js (FULL) — 6 LOCKERS + CLOSE/UNREGISTER + RASPI BEST-EFFORT + SLIDER SUPPORT
// Yêu cầu:
// - open.html: grid-item có data-locker-id="01"..."06"
// - index.html: slider slide có data-locker-id="01"..."06" và import open.js trước slide_interaction.js

// ✅ Backend Render URL
const RENDER_BRIDGE = "https://f-locker-backend.onrender.com";

// ✅ Locker config
const VALID_LOCKERS = ["01", "02", "03", "04", "05", "06"];

// ===== USER =====
const userRaw = sessionStorage.getItem("user");
const currentUser = userRaw ? JSON.parse(userRaw) : null;
const currentUserId = currentUser
  ? String(currentUser._id || currentUser.id || "")
  : null;

// ===== STATE =====
let lockerStates = {};
window.__lockerStates = lockerStates; // cho slider dùng nếu cần

// ===== JWT =====
function getToken() {
  return sessionStorage.getItem("token");
}

// ===== helpers =====
function isOpenPage() {
  return window.location.pathname.toLowerCase().includes("open");
}

function normalizeId(v) {
  if (v === null || v === undefined) return null;
  return String(v);
}

function isValidLocker(id) {
  return VALID_LOCKERS.includes(String(id));
}

function requireLogin() {
  alert("Bạn cần đăng nhập để sử dụng chức năng này.");
  window.location.href = "./logon.html";
}

async function apiFetch(path, options = {}) {
  const url = `${RENDER_BRIDGE}${path}`;
  const headers = new Headers(options.headers || {});

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const token = getToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(url, { ...options, headers });
}

// ===== USER UPDATE (compat nhiều endpoint) =====
const USER_UPDATE_ENDPOINTS = ["/auth/update", "/update", "/account/update"];

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
        try {
          Object.assign(currentUser, data.user);
        } catch (_) {}
        return true;
      }

      if (!res.ok) {
        console.warn("updateUserField failed:", ep, data?.error || res.status);
        return false;
      }
    } catch (err) {
      console.warn("updateUserField error:", ep, err.message);
    }
  }

  // fallback: update session only (UI không kẹt)
  try {
    const updated = { ...(currentUser || {}), [field]: value };
    sessionStorage.setItem("user", JSON.stringify(updated));
    if (currentUser) Object.assign(currentUser, updated);
  } catch (_) {}
  return true;
}

// ===== locker utils =====
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

// auto sync registeredLocker <-> DB
async function autoSyncUserLocker() {
  if (!currentUserId) return;

  const myDB = getMyLockerFromDB();
  const myUser = getMyLockerFromUser();

  if (myDB && myUser !== myDB) {
    await updateUserField("registeredLocker", myDB);
    return;
  }

  if (!myDB && myUser) {
    await updateUserField("registeredLocker", null);
  }
}

// ===== RASPI COMMANDS via backend =====
// ✅ FIX: chấp nhận nhiều format JSON trả về + best-effort
async function sendRaspiCommand(action, lockerId) {
  const res = await apiFetch(`/raspi/${action}`, {
    method: "POST",
    body: JSON.stringify({
      lockerId,
      user: currentUser?.email || null,
    }),
  });

  const data = await res.json().catch(() => ({}));

  // ✅ accept multiple OK formats
  const ok =
    res.ok &&
    (data.success === true ||
      data.ok === true ||
      data.status === "ok" ||
      data.message === "OK" ||
      data.message === "ok");

  if (!ok) {
    throw new Error(data?.error || data?.message || `Raspi ${action} failed`);
  }

  return true;
}

// ===== API: fetch lockers =====
async function fetchLockerStates() {
  const res = await apiFetch("/lockers/status", { method: "GET" });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  if (!data.success || !Array.isArray(data.lockers)) {
    throw new Error(data?.error || "Invalid lockers payload");
  }

  lockerStates = {};
  data.lockers.forEach((l) => {
    const id = String(l.lockerId).padStart(2, "0");
    if (!isValidLocker(id)) return;

    lockerStates[id] = {
      status: String(l.status || "EMPTY"),
      userId: l.ownerId ? String(l.ownerId) : null,
    };
  });

  VALID_LOCKERS.forEach((id) => {
    if (!lockerStates[id]) lockerStates[id] = { status: "EMPTY", userId: null };
  });

  window.__lockerStates = lockerStates;

  if (typeof window.updateSliderUI === "function") {
    window.updateSliderUI(lockerStates);
  }
}

// ===== API: update locker =====
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
    status: data.locker?.status || status,
    userId: data.locker?.ownerId || ownerId || null,
  };

  window.__lockerStates = lockerStates;

  if (typeof window.updateSliderUI === "function") {
    window.updateSliderUI(lockerStates);
  }

  return true;
}

// ===== UI STYLES =====
function applyStateClass(item, state, isMine) {
  item.classList.remove(
    "status-empty",
    "status-locked",
    "status-open",
    "status-other"
  );

  item.style.border = "";
  item.style.backgroundColor = "";
  item.style.opacity = "1";

  if (state.status === "EMPTY") {
    item.classList.add("status-empty");
    return;
  }

  if (isMine) {
    if (state.status === "LOCKED") {
      item.classList.add("status-locked");
      item.style.border = "2px solid #ffd000"; 
      item.style.backgroundColor = "rgba(255, 208, 0, 0.18)";
    } else if (state.status === "OPEN") {
      item.classList.add("status-open");
      item.style.border = "2px solid #00ff66"; 
      item.style.backgroundColor = "rgba(0, 255, 102, 0.14)";
    } else {
      item.classList.add("status-locked");
      item.style.border = "2px solid #ffd000";
      item.style.backgroundColor = "rgba(255, 208, 0, 0.18)";
    }
  } else {
    item.classList.add("status-other");
    item.style.border = "2px solid #ff2a2a"; 
    item.style.backgroundColor = "rgba(255, 42, 42, 0.16)";
    item.style.opacity = "0.85";
  }
}

function addHoverButton(item, opts) {
  item.querySelectorAll(".hover-action-btn").forEach((b) => b.remove());

  const btn = document.createElement("button");
  btn.className = "hover-action-btn";
  btn.type = "button";
  btn.textContent = opts.text;

  btn.style.position = "absolute";
  btn.style.left = "50%";
  btn.style.bottom = "10px";
  btn.style.transform = "translateX(-50%)";
  btn.style.zIndex = "10";
  btn.style.padding = "6px 10px";
  btn.style.borderRadius = "8px";
  btn.style.border = "0";
  btn.style.cursor = "pointer";
  btn.style.background = opts.bg;
  btn.style.color = opts.color;

  btn.style.opacity = "0";
  btn.style.visibility = "hidden";
  btn.style.transition = "opacity 0.2s ease";

  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await opts.onClick();
  });

  item.appendChild(btn);

  item.addEventListener("mouseenter", () => {
    btn.style.visibility = "visible";
    btn.style.opacity = "1";
  });
  item.addEventListener("mouseleave", () => {
    btn.style.visibility = "hidden";
    btn.style.opacity = "0";
  });
}


function updateGridUI() {
  if (!isOpenPage()) return;

  const grid = document.querySelector(".grid-container");
  if (!grid) return;

  const uid = normalizeId(currentUserId);
  const myLocker = getMyLockerFromDB() || getMyLockerFromUser();

  grid.querySelectorAll(".grid-item").forEach((item) => {
    const lockerId = item.dataset.lockerId;
    if (!isValidLocker(lockerId)) return;

    const state = lockerStates[lockerId] || { status: "EMPTY", userId: null };

    item.style.position = "relative";
    const isMine = uid && normalizeId(state.userId) === uid;

    applyStateClass(item, state, isMine);

    item.querySelectorAll(".hover-action-btn").forEach((b) => b.remove());

   
    if (isMine && state.status === "OPEN") {
      addHoverButton(item, {
        text: "ĐÓNG TỦ",
        bg: "#ff2a2a",
        color: "#fff",
        onClick: () => window.handleCloseLocker(lockerId),
      });
    } else if (isMine && state.status === "LOCKED") {
      addHoverButton(item, {
        text: "HỦY ĐĂNG KÝ",
        bg: "#ff8800",
        color: "#fff",
        onClick: () => window.handleUnregister(lockerId),
      });
    }

    
    if (myLocker && lockerId === myLocker) {
      item.style.outline = "2px solid rgba(255,255,255,0.25)";
      item.style.outlineOffset = "4px";
    } else {
      item.style.outline = "";
      item.style.outlineOffset = "";
    }
  });
}


function handleLockerClick(lockerId) {
  if (!currentUserId) return requireLogin();
  if (!isValidLocker(lockerId)) return alert("LockerId không hợp lệ.");

  const state = lockerStates[lockerId] || { status: "EMPTY", userId: null };
  const myLocker = getMyLockerFromDB() || getMyLockerFromUser();

  
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
window.handleLockerClick = handleLockerClick;


async function handleCloseLocker(lockerId) {
  if (!currentUserId) return requireLogin();
  if (!confirm(`Bạn có chắc muốn ĐÓNG tủ ${lockerId} không?`)) return;

  try {
 
    try {
      await sendRaspiCommand("lock", lockerId);
    } catch (e) {
      console.warn("⚠️ Raspi lock fail (vẫn tiếp tục cập nhật DB):", e.message);
    }

    await updateLockerStatus(lockerId, "LOCKED", currentUserId);

    await fetchLockerStates();
    await autoSyncUserLocker();
    updateGridUI();

    alert(`✅ Đã đóng tủ ${lockerId} (LOCKED).`);
  } catch (e) {
    console.error(e);
    alert(`❌ Đóng tủ thất bại: ${e.message}`);
  }
}
window.handleCloseLocker = handleCloseLocker;

async function handleUnregister(lockerId) {
  if (!currentUserId) return requireLogin();

  if (!confirm(`Bạn có chắc muốn HỦY ĐĂNG KÝ tủ ${lockerId}? Tủ sẽ về TRỐNG.`))
    return;

  try {
 
    try {
      await sendRaspiCommand("lock", lockerId);
    } catch (e) {
      console.warn("⚠️ Raspi lock fail (vẫn tiếp tục cập nhật DB):", e.message);
    }

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
window.handleUnregister = handleUnregister;


window.openLockerSuccess = async (lockerId) => {
  if (!lockerId || !currentUserId) return;
  if (!isValidLocker(lockerId)) return alert("LockerId không hợp lệ.");

  try {
   
    try {
      await sendRaspiCommand("unlock", lockerId);
    } catch (e) {
      console.warn(
        "⚠️ Raspi unlock fail (vẫn tiếp tục cập nhật DB):",
        e.message
      );
    }

    await updateLockerStatus(lockerId, "OPEN", currentUserId);
    await updateUserField("registeredLocker", lockerId);

    alert(`🔓 Tủ ${lockerId} đã mở!`);
    window.location.href = "./index.html";
  } catch (e) {
    console.error(e);
    alert(`❌ Mở tủ thất bại: ${e.message}`);
  }
};


document.addEventListener("DOMContentLoaded", async () => {
  try {
    
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

    await fetchLockerStates();
    await autoSyncUserLocker();
    updateGridUI();
  } catch (e) {
    console.error(e);
    alert("Không thể tải trạng thái tủ: " + e.message);
  }
});


setInterval(async () => {
  try {
    await fetchLockerStates();
    if (isOpenPage()) updateGridUI();
  } catch (_) {}
}, 5000);
