// scripts/auto_lock.js
import { API_BASE } from "./api.js";
import { getToken, clearAuth, apiFetch } from "./http.js";

/**
 * Lấy lockerId đang active (bạn có thể đổi key theo dự án)
 */
export function getActiveLockerId() {
  return sessionStorage.getItem("activeLockerId"); // ví dụ: "01"
}

/**
 * Gọi lock + update trạng thái về LOCKED
 * - cố gắng gọi Raspi lock trước
 * - sau đó update DB locker_states về LOCKED (để UI đồng bộ)
 */
export async function lockLockerNow(lockerId) {
  if (!lockerId) return;

  // 1) Raspi lock
  try {
    await apiFetch("/raspi/lock", {
      method: "POST",
      body: JSON.stringify({ lockerId }),
    });
  } catch (e) {
    // Raspi fail vẫn tiếp tục update DB để tránh UI bị OPEN mãi
    console.warn("[AUTO-LOCK] Raspi lock failed:", e?.message || e);
  }

  // 2) Update locker status DB
  try {
    await apiFetch("/lockers/update", {
      method: "POST",
      body: JSON.stringify({ lockerId, status: "LOCKED" }),
    });
  } catch (e) {
    console.warn("[AUTO-LOCK] Update locker status failed:", e?.message || e);
  }
}

/**
 * Best-effort lock dùng cho đóng tab / pagehide
 * Dùng fetch keepalive trực tiếp (không rely apiFetch vì redirect/throw)
 */
export function lockOnExitBestEffort() {
  const token = getToken();
  const lockerId = getActiveLockerId();
  if (!token || !lockerId) return;

  // Raspi lock (keepalive)
  try {
    fetch(`${API_BASE}/raspi/lock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ lockerId }),
      keepalive: true,
    });
  } catch (_) {}

  // Update DB (keepalive)
  try {
    fetch(`${API_BASE}/lockers/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ lockerId, status: "LOCKED" }),
      keepalive: true,
    });
  } catch (_) {}
}

/**
 * Logout chuẩn: lock xong mới clearAuth
 */
export async function logoutWithAutoLock() {
  const lockerId = getActiveLockerId();
  if (lockerId) {
    await lockLockerNow(lockerId);
  }

  // clear session/token
  sessionStorage.removeItem("activeLockerId");
  sessionStorage.removeItem("activeLockerStatus");
  clearAuth();

  location.href = "./logon.html";
}
