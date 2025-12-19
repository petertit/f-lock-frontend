import { API_BASE } from "../api/api.js";

const API = API_BASE;

const userRaw = sessionStorage.getItem("user");
const currentUser = userRaw ? JSON.parse(userRaw) : null;
const currentUserId = currentUser ? currentUser._id || currentUser.id : null;

let lockerStates = {};

function isOpenPage() {
  return window.location.pathname.toLowerCase().includes("open");
}

function parseFetchError(err, url) {
  return `Không gọi được API (Network/CORS). URL: ${url} | ${err.message}`;
}

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

    updateGridUI();
  } catch (err) {
    console.error("❌ Error loading locker states:", err);
    alert("Không thể tải trạng thái tủ khóa: " + parseFetchError(err, url));
  }
}

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

function updateGridUI() {
  if (!isOpenPage()) return;

  const grid = document.querySelector(".grid-container");
  if (!grid) return;

  grid.querySelectorAll(".grid-item").forEach((item) => {
    const id = item.dataset.lockerId;
    const state = lockerStates[id] || { status: "EMPTY", userId: null };

    item.classList.remove("status-empty", "status-locked", "status-open");

    if (state.status === "EMPTY") item.classList.add("status-empty");
    if (state.status === "LOCKED") item.classList.add("status-locked");
    if (state.status === "OPEN") item.classList.add("status-open");
  });
}

function handleLockerClick(lockerId) {
  if (!currentUserId) {
    alert("Bạn cần đăng nhập.");
    window.location.href = "./logon.html";
    return;
  }

  const state = lockerStates[lockerId] || { status: "EMPTY", userId: null };

  if (state.status === "EMPTY" || state.userId === currentUserId) {
    sessionStorage.setItem("locker_to_open", lockerId);
    window.location.href = "./face_log.html";
    return;
  }

  alert(`Tủ ${lockerId} đang được người khác sử dụng.`);
}

document.addEventListener("DOMContentLoaded", () => {
  if (isOpenPage()) {
    const grid = document.querySelector(".grid-container");
    if (grid) {
      grid.addEventListener("click", (e) => {
        const item = e.target.closest(".grid-item");
        if (!item) return;
        handleLockerClick(item.dataset.lockerId);
      });
    }
  }

  fetchLockerStates();
});

window.openLockerSuccess = async (lockerId) => {
  if (!lockerId || !currentUserId) return;

  const ok = await updateLockerStatus(lockerId, "OPEN", currentUserId);
  if (ok) {
    alert(`🔓 Tủ ${lockerId} đã mở!`);
    window.location.href = "./index.html";
  }
};
