import { API_BASE } from "../api/api.js";

const API = API_BASE;

//Session User
let currentUser = null;
let currentUserId = null;

function loadUserFromSession() {
  const raw = sessionStorage.getItem("user");
  currentUser = raw ? JSON.parse(raw) : null;
  currentUserId = currentUser ? currentUser._id || currentUser.id : null;
}

loadUserFromSession();

//Locker States
let lockerStates = {};

function isOpenPage() {
  return window.location.pathname.toLowerCase().includes("open");
}

function parseFetchError(err, url) {
  return `Không gọi được API (Network/CORS). URL: ${url} | ${err.message}`;
}

//Refresh user from server
async function refreshUserFromServer() {
  if (!currentUserId) return null;

  const url = `${API}/user/${currentUserId}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.user) {
      console.warn(
        "⚠️ refreshUserFromServer failed:",
        data?.error || res.status
      );
      return null;
    }

    sessionStorage.setItem("user", JSON.stringify(data.user));
    loadUserFromSession();
    console.log("✅ Refreshed user:", currentUser);
    return currentUser;
  } catch (err) {
    console.warn("⚠️ refreshUserFromServer network error:", err);
    return null;
  }
}

//Fetch locker status
async function fetchLockerStates() {
  const url = `${API}/lockers/status`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} - ${text || "Not OK"}`);
    }

    const data = await res.json();
    if (!data.success || !Array.isArray(data.lockers)) {
      throw new Error(data.error || "Invalid JSON structure");
    }

    lockerStates = Object.fromEntries(
      data.lockers.map((l) => [
        l.lockerId,
        { status: l.status, userId: l.ownerId || null },
      ])
    );

    const reg = currentUser?.registeredLocker;
    if (typeof reg === "string" && /^\d{2}$/.test(reg)) {
      if (!lockerStates[reg]) {
        lockerStates[reg] = { status: "LOCKED", userId: currentUserId };
      } else if (!lockerStates[reg].userId) {
        lockerStates[reg].userId = currentUserId;
        if (lockerStates[reg].status === "EMPTY")
          lockerStates[reg].status = "LOCKED";
      }
    }

    updateGridUI();
  } catch (err) {
    console.error("❌ Error loading locker states:", err);
    alert("Không thể tải trạng thái tủ khóa: " + parseFetchError(err, url));
  }
}

//Update locker status
async function updateLockerStatus(lockerId, status, ownerId) {
  const url = `${API}/lockers/update`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lockerId, status, ownerId }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    lockerStates[lockerId] = {
      status: data.locker.status,
      userId: data.locker.ownerId,
    };

    updateGridUI();
    return true;
  } catch (err) {
    console.error("❌ updateLockerStatus error:", err);
    alert(`❌ Lỗi cập nhật tủ ${lockerId}: ${err.message}`);
    return false;
  }
}

//UI
function updateGridUI() {
  if (!isOpenPage()) return;

  const grid = document.querySelector(".grid-container");
  if (!grid) return;

  grid.querySelectorAll(".grid-item").forEach((item) => {
    const id = item.dataset.lockerId;
    const state = lockerStates[id] || { status: "EMPTY", userId: null };

    item.classList.remove("status-empty", "status-locked", "status-open");
    item.style.opacity = "1";
    item.style.border = "";
    item.style.backgroundColor = "";

    if (state.status === "EMPTY") item.classList.add("status-empty");
    if (state.status === "LOCKED") item.classList.add("status-locked");
    if (state.status === "OPEN") item.classList.add("status-open");

    if (state.userId && currentUserId && state.userId === currentUserId) {
      item.style.border = "2px solid lime";
      item.style.backgroundColor = "rgba(0,255,0,0.12)";
    } else if (state.status !== "EMPTY") {
      item.style.opacity = "0.7";
    }
  });
}

//Click handler
function handleLockerClick(lockerId) {
  if (!currentUserId) {
    alert("Bạn cần đăng nhập.");
    window.location.href = "./logon.html";
    return;
  }

  const state = lockerStates[lockerId] || { status: "EMPTY", userId: null };

  if (state.status === "EMPTY") {
    sessionStorage.setItem("locker_to_open", lockerId);
    window.location.href = "./face_log.html";
    return;
  }

  if (state.userId === currentUserId) {
    sessionStorage.setItem("locker_to_open", lockerId);
    window.location.href = "./face_log.html";
    return;
  }

  alert(`Tủ ${lockerId} đang được người khác sử dụng.`);
}

//INIT
document.addEventListener("DOMContentLoaded", async () => {
  if (!isOpenPage()) return;

  await refreshUserFromServer();

  const grid = document.querySelector(".grid-container");
  if (grid) {
    grid.addEventListener("click", (e) => {
      const item = e.target.closest(".grid-item");
      if (!item) return;
      handleLockerClick(item.dataset.lockerId);
    });
  }

  await fetchLockerStates();
});

window.openLockerSuccess = async (lockerId) => {
  loadUserFromSession();
  if (!lockerId || !currentUserId) return;

  const ok = await updateLockerStatus(lockerId, "OPEN", currentUserId);
  if (ok) {
    alert(`🔓 Tủ ${lockerId} đã mở!`);
    window.location.href = "./index.html";
  }
};
