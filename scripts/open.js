import { API_BASE } from "../api/api.js";

const API = API_BASE;

// ====== USER (đúng & an toàn) ======
const userRaw = sessionStorage.getItem("user");
const currentUser = userRaw ? JSON.parse(userRaw) : null;
const currentUserId = currentUser ? (currentUser._id || currentUser.id) : null;

// Locker states cache: { "01": {status:"EMPTY|LOCKED|OPEN", userId:"..."} }
let lockerStates = {};

// endpoint update user (tùy backend của bạn đang mount kiểu nào)
const USER_UPDATE_ENDPOINTS = ["/auth/update", "/update", "/account/update"];

// ====== Helpers ======
function isOpenPage() {
  // Cloudflare Pages có thể là /open hoặc /open.html
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
      const res = await fetch(`${API}${ep}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: currentUserId, [field]: value }),
      });

      if (res.status === 404) continue;

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.user) {
        sessionStorage.setItem("user", JSON.stringify(data.user));
        // update in-memory object
        Object.assign(currentUser, data.user);
        return true;
      }

      // endpoint có tồn tại nhưng error
      console.warn("updateUserField failed:", ep, data?.error || res.status);
      return false;
    } catch (e) {
      // thử endpoint khác
      console.warn("updateUserField network error:", ep, e.message);
    }
  }

  // fallback: nếu không update server được thì vẫn update session để UI chạy
  const updated = { ...(currentUser || {}), [field]: value };
  sessionStorage.setItem("user", JSON.stringify(updated));
  if (currentUser) Object.assign(currentUser, updated);
  return true;
}

function applyStateClass(item, state, isMine) {
  item.classList.remove("status-empty", "status-locked", "status-open", "status-other");
  item.style.outline = "";
  item.style.border = "";
  item.style.backgroundColor = "";

  // default class theo status
  if (state.status === "EMPTY") item.classList.add("status-empty");

  // Màu theo yêu cầu:
  // - tủ người khác: đỏ
  // - tủ mình: vàng nếu LOCKED, xanh nếu OPEN
  if (state.status !== "EMPTY") {
    if (isMine) {
      if (state.status === "LOCKED") {
        item.classList.add("status-locked");
        item.style.border = "2px solid #ffd000"; // vàng
        item.style.backgroundColor = "rgba(255, 208, 0, 0.18)";
      } else if (state.status === "OPEN") {
        item.classList.add("status-open");
        item.style.border = "2px solid #00ff66"; // xanh lá
        item.style.backgroundColor = "rgba(0, 255, 102, 0.14)";
      }
    } else {
      // người khác
      item.classList.add("status-other");
      item.style.border = "2px solid #ff2a2a"; // đỏ
      item.style.backgroundColor = "rgba(255, 42, 42, 0.16)";
      item.style.opacity = "0.85";
    }
  }
}

function addUnregisterButton(item, lockerId) {
  // xóa button cũ nếu có
  item.querySelectorAll(".unregister-btn").forEach((b) => b.remove());

  const btn = document.createElement("button");
  btn.className = "unregister-btn";
  btn.textContent = "HỦY ĐĂNG KÝ";
  btn.type = "button";

  // style inline để chắc chắn chạy (không phụ thuộc CSS)
  btn.style.position = "absolute";
  btn.style.left = "50%";
  btn.style.bottom = "10px";
  btn.style.transform = "translateX(-50%)";
  btn.style.zIndex = "10";
  btn.style.padding = "6px 10px";
  btn.style.borderRadius = "8px";
  btn.style.border = "0";
  btn.style.cursor = "pointer";
  btn.style.background = "#ff8800";
  btn.style.color = "#fff";

  btn.style.opacity = "0";
  btn.style.visibility = "hidden";
  btn.style.transition = "opacity 0.2s ease";

  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await handleUnregister(lockerId);
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

// ====== API calls ======
async function fetchLockerStates() {
  const url = `${API}/lockers/status`;
  const res = await fetch(url, { method: "GET" });

  // nếu backend trả HTML (error page) => res.json sẽ vỡ
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`API không trả JSON. Status=${res.status}. Body bắt đầu: ${text.slice(0, 60)}...`);
  }

  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  if (!data.success || !Array.isArray(data.lockers)) throw new Error(data?.error || "Sai cấu trúc lockers");

  lockerStates = Object.fromEntries(
    data.lockers.map((l) => [
      String(l.lockerId),
      { status: String(l.status), userId: l.ownerId ? String(l.ownerId) : null },
    ])
  );

  return lockerStates;
}

async function updateLockerStatus(lockerId, status, ownerId) {
  const url = `${API}/lockers/update`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lockerId, status, ownerId }),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Update API không trả JSON. Status=${res.status}. Body: ${text.slice(0, 80)}...`);
  }

  if (!res.ok || !data.success) throw new Error(data?.error || `HTTP ${res.status}`);

  lockerStates[lockerId] = {
    status: data.locker.status,
    userId: data.locker.ownerId || null,
  };

  return true;
}

// ====== Sync logic (tự đồng bộ) ======
async function autoSyncUserLocker() {
  if (!currentUserId) return;

  const myLockerDB = getMyLockerFromDB();     // theo DB
  const myLockerUser = getMyLockerFromUser(); // theo user session

  // Case A: DB nói bạn đang sở hữu 1 tủ nhưng user.registeredLocker lại rỗng/sai -> update user
  if (myLockerDB && myLockerUser !== myLockerDB) {
    await updateUserField("registeredLocker", myLockerDB);
    return;
  }

  // Case B: user nói bạn có tủ nhưng DB không thấy ownerId của bạn ở đâu -> clear user
  // (vì DB là “nguồn sự thật” để tránh bug đăng ký 2 tủ)
  if (!myLockerDB && myLockerUser) {
    await updateUserField("registeredLocker", null);
  }
}

// ====== UI ======
function updateGridUI() {
  if (!isOpenPage()) return;

  const grid = document.querySelector(".grid-container");
  if (!grid) return;

  const uid = normalizeId(currentUserId);
  const myLockerDB = getMyLockerFromDB();
  const myLockerUser = getMyLockerFromUser();
  const myLocker = myLockerDB || myLockerUser; // ưu tiên DB

  grid.querySelectorAll(".grid-item").forEach((item) => {
    const lockerId = item.dataset.lockerId;
    const state = lockerStates[lockerId] || { status: "EMPTY", userId: null };

    // set relative để button absolute hoạt động
    item.style.position = "relative";

    const isMine = uid && normalizeId(state.userId) === uid;

    // áp màu đúng theo yêu cầu
    applyStateClass(item, state, isMine);

    // hover nút hủy đăng ký nếu là tủ của mình (LOCKED/OPEN đều cho hủy)
    item.querySelectorAll(".unregister-btn").forEach((b) => b.remove());
    if (isMine && state.status !== "EMPTY") {
      addUnregisterButton(item, lockerId);
    }

    // optional: nếu bạn muốn “highlight” tủ của mình cho rõ
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

  // Nếu click tủ trống:
  if (state.status === "EMPTY") {
    // Nhưng user đã có tủ khác -> chặn đăng ký tủ mới
    if (myLocker && myLocker !== lockerId) {
      alert(`Bạn đã đăng ký tủ ${myLocker}. Hãy hủy đăng ký trước khi chọn tủ khác.`);
      return;
    }

    // cho phép đi qua face_log để xác thực mở + đăng ký
    sessionStorage.setItem("locker_to_open", lockerId);
    window.location.href = "./face_log.html";
    return;
  }

  // Nếu tủ là của mình -> cho mở (đi face_log)
  if (normalizeId(state.userId) === normalizeId(currentUserId)) {
    sessionStorage.setItem("locker_to_open", lockerId);
    window.location.href = "./face_log.html";
    return;
  }

  // tủ người khác
  alert(`Tủ ${lockerId} đang được người khác sử dụng.`);
}

async function handleUnregister(lockerId) {
  if (!currentUserId) return requireLogin();

  if (!confirm(`Bạn có chắc muốn hủy đăng ký tủ ${lockerId}? Tủ sẽ trở về TRỐNG.`)) return;

  try {
    // cập nhật DB: EMPTY + ownerId null
    await updateLockerStatus(lockerId, "EMPTY", null);

    // cập nhật user
    await updateUserField("registeredLocker", null);

    // refresh UI
    await fetchLockerStates();
    await autoSyncUserLocker();
    updateGridUI();

    alert(`✅ Đã hủy đăng ký tủ ${lockerId}.`);
  } catch (e) {
    console.error(e);
    alert(`❌ Hủy đăng ký thất bại: ${e.message}`);
  }
}

// callback từ face_log.html gọi qua window.opener hoặc cùng window
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
