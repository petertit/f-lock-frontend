// open.js (FULL) — 6 LOCKERS + CLOSE/UNREGISTER LOGIC

const RENDER_BRIDGE = "https://smart-locker-kgnx.onrender.com";
const LOCKER_COUNT = 6;
const VALID_LOCKERS = ["01", "02", "03", "04", "05", "06"];

// ===== USER =====
const userRaw = sessionStorage.getItem("user");
const currentUser = userRaw ? JSON.parse(userRaw) : null;

// hỗ trợ nhiều kiểu key: _id | id
const currentUserId = currentUser
  ? String(currentUser._id || currentUser.id || "")
  : null;

// ===== STATE =====
// lockerStates: { "01": {status:"EMPTY|LOCKED|OPEN", userId:"..."} }
let lockerStates = {};

// ===== JWT (optional) =====
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

  // auto content-type for json body
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // attach token if exists
  const token = getToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(url, { ...options, headers });
  return res;
}

// ===== USER UPDATE (giữ compatibility nhiều endpoint) =====
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
        // cập nhật currentUser (nếu có)
        try {
          Object.assign(currentUser, data.user);
        } catch (_) {}
        return true;
      }

      // nếu server trả lỗi rõ ràng
      if (!res.ok) {
        console.warn("updateUserField failed:", ep, data?.error || res.status);
        return false;
      }
    } catch (err) {
      console.warn("updateUserField error:", ep, err.message);
    }
  }

  // fallback: update session only (để UI không kẹt)
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
async function sendRaspiCommand(action, lockerId) {
  // action: "lock" | "unlock"
  const res = await apiFetch(`/raspi/${action}`, {
    method: "POST",
    body: JSON.stringify({
      lockerId,
      user: currentUser?.email || null,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data?.error || `Raspi ${action} failed`);
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

  // normalize only 6 lockers
  lockerStates = {};
  data.lockers.forEach((l) => {
    const id = String(l.lockerId).padStart(2, "0");
    if (!isValidLocker(id)) return;
    lockerStates[id] = {
      status: String(l.status || "EMPTY"),
      userId: l.ownerId ? String(l.ownerId) : null,
    };
  });

  // ensure missing lockers exist locally
  VALID_LOCKERS.forEach((id) => {
    if (!lockerStates[id]) lockerStates[id] = { status: "EMPTY", userId: null };
  });

  // Update UI on index slider if exists
  if (typeof window.updateSliderUI === "function") {
    window.updateSliderUI(lockerStates);
  }
}

// ===== API: update locker =====
async function updateLockerStatus(lockerId, status, ownerId) {
  const res = await apiFetch("/lockers/update", {
    method: "POST",
    body: JSON.stringify({
      lockerId,
      status,
      ownerId,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }

  lockerStates[lockerId] = {
    status: data.locker?.status || status,
    userId: data.locker?.ownerId || ownerId || null,
  };

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

  // reset inline
  item.style.border = "";
  item.style.backgroundColor = "";
  item.style.opacity = "1";

  if (state.status === "EMPTY") {
    item.classList.add("status-empty");
    return;
  }

  if (isMine) {
    if (state.status === "LOCKED") {
      // MY LOCKED => YELLOW
      item.classList.add("status-locked");
      item.style.border = "2px solid #ffd000";
      item.style.backgroundColor = "rgba(255, 208, 0, 0.18)";
    } else if (state.status === "OPEN") {
      // MY OPEN => GREEN
      item.classList.add("status-open");
      item.style.border = "2px solid #00ff66";
      item.style.backgroundColor = "rgba(0, 255, 102, 0.14)";
    } else {
      item.classList.add("status-locked");
      item.style.border = "2px solid #ffd000";
      item.style.backgroundColor = "rgba(255, 208, 0, 0.18)";
    }
  } else {
    // OTHER USER => RED
    item.classList.add("status-other");
    item.style.border = "2px solid #ff2a2a";
    item.style.backgroundColor = "rgba(255, 42, 42, 0.16)";
    item.style.opacity = "0.85";
  }
}

function addHoverButton(item, opts) {
  // remove any previous
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

// ===== UI: update grid =====
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
    if (!isValidLocker(lockerId)) return;

    const state = lockerStates[lockerId] || { status: "EMPTY", userId: null };

    item.style.position = "relative";

    const isMine = uid && normalizeId(state.userId) === uid;

    applyStateClass(item, state, isMine);

    // remove old hover action buttons
    item.querySelectorAll(".hover-action-btn").forEach((b) => b.remove());

    // ✅ Button logic:
    // - MY OPEN   => "ĐÓNG TỦ" (đỏ)
    // - MY LOCKED => "HỦY ĐĂNG KÝ" (cam)
    if (isMine && state.status === "OPEN") {
      addHoverButton(item, {
        text: "ĐÓNG TỦ",
        bg: "#ff2a2a",
        color: "#fff",
        onClick: () => handleCloseLocker(lockerId),
      });
    } else if (isMine && state.status === "LOCKED") {
      addHoverButton(item, {
        text: "HỦY ĐĂNG KÝ",
        bg: "#ff8800",
        color: "#fff",
        onClick: () => handleUnregister(lockerId),
      });
    }

    // highlight my locker
    if (myLocker && lockerId === myLocker) {
      item.style.outline = "2px solid rgba(255,255,255,0.25)";
      item.style.outlineOffset = "4px";
    } else {
      item.style.outline = "";
      item.style.outlineOffset = "";
    }
  });
}

// ===== CLICK LOGIC =====
function handleLockerClick(lockerId) {
  if (!currentUserId) return requireLogin();

  if (!isValidLocker(lockerId)) {
    alert("LockerId không hợp lệ.");
    return;
  }

  const state = lockerStates[lockerId] || { status: "EMPTY", userId: null };

  const myLockerDB = getMyLockerFromDB();
  const myLockerUser = getMyLockerFromUser();
  const myLocker = myLockerDB || myLockerUser;

  // EMPTY => register/open (but only if no other locker registered)
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

  // My locker => go face_log to open again (or to confirm)
  if (normalizeId(state.userId) === normalizeId(currentUserId)) {
    sessionStorage.setItem("locker_to_open", lockerId);
    window.location.href = "./face_log.html";
    return;
  }

  // Other user's locker
  alert(`Tủ ${lockerId} đang được người khác sử dụng.`);
}

// ===== ACTIONS =====
async function handleCloseLocker(lockerId) {
  if (!currentUserId) return requireLogin();

  if (!confirm(`Bạn có chắc muốn ĐÓNG tủ ${lockerId} không?`)) return;

  try {
    // 1) lock physical (best effort)
    await sendRaspiCommand("lock", lockerId);

    // 2) DB => LOCKED (owner still me)
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

  if (
    !confirm(
      `Bạn có chắc muốn HỦY ĐĂNG KÝ tủ ${lockerId}? Tủ sẽ được KHÓA lại và trở về TRỐNG.`
    )
  )
    return;

  try {
    // 1) lock physical (best effort, nếu fail vẫn tiếp tục)
    try {
      await sendRaspiCommand("lock", lockerId);
    } catch (e) {
      console.warn(
        "⚠️ Lock vật lý thất bại (vẫn tiếp tục cập nhật DB):",
        e.message
      );
    }

    // 2) DB => EMPTY
    await updateLockerStatus(lockerId, "EMPTY", null);

    // 3) user => registeredLocker null
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

// ===== CALLBACK AFTER FACE/PASS SUCCESS =====
// face_log.html hoặc pass_lock_login.html gọi window.openLockerSuccess(lockerId)
window.openLockerSuccess = async (lockerId) => {
  if (!lockerId || !currentUserId) return;

  if (!isValidLocker(lockerId)) {
    alert("LockerId không hợp lệ.");
    return;
  }

  try {
    // 1) unlock physical (best effort)
    try {
      await sendRaspiCommand("unlock", lockerId);
    } catch (e) {
      console.warn(
        "⚠️ Unlock vật lý thất bại (vẫn tiếp tục cập nhật DB):",
        e.message
      );
    }

    // 2) DB => OPEN
    await updateLockerStatus(lockerId, "OPEN", currentUserId);

    // 3) user => registeredLocker lockerId
    await updateUserField("registeredLocker", lockerId);

    alert(`🔓 Tủ ${lockerId} đã mở!`);
    window.location.href = "./index.html";
  } catch (e) {
    alert(`❌ Mở tủ thất bại: ${e.message}`);
  }
};

// ===== INIT =====
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // attach click handler for open page
    if (isOpenPage()) {
      const grid = document.querySelector(".grid-container");
      if (grid) {
        grid.addEventListener("click", (e) => {
          const item = e.target.closest(".grid-item");
          if (!item) return;
          // ignore button clicks
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

// polling để tự đồng bộ khi người khác thao tác
setInterval(async () => {
  try {
    await fetchLockerStates();
    if (isOpenPage()) updateGridUI();
  } catch (_) {}
}, 5000);
