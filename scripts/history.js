// scripts/history.js
import { API_BASE } from "../api/api.js";

const API = API_BASE;

function getCurrentUser() {
  try {
    const raw = sessionStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getUserId(user) {
  if (!user) return null;
  return user._id || user.id || user.userId || null;
}

function formatTime(ts) {
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return String(ts);
    return d.toLocaleString("vi-VN");
  } catch {
    return String(ts);
  }
}

// ✅ lockerId lấy từ query hoặc session
function getLockerIdHint() {
  const url = new URL(window.location.href);
  const q = url.searchParams.get("lockerId");
  return (
    q ||
    sessionStorage.getItem("selected_locker") ||
    sessionStorage.getItem("locker_to_open") ||
    sessionStorage.getItem("selectedLocker") ||
    ""
  );
}

function setLockerTitle() {
  const titleEl = document.getElementById("historyLockerName");
  if (!titleEl) return;

  const lockerId = getLockerIdHint();
  titleEl.textContent = lockerId ? `Locker [${lockerId}]` : "Locker [History]";
}

function renderHistory(listEl, history) {
  listEl.innerHTML = "";

  if (!history.length) {
    const li = document.createElement("li");
    li.style.textAlign = "center";
    li.style.color = "#aaa";
    li.textContent = "Chưa có lịch sử.";
    listEl.appendChild(li);
    return;
  }

  history.forEach((h) => {
    const li = document.createElement("li");
    li.style.padding = "12px 10px";
    li.style.borderBottom = "1px solid rgba(255,255,255,0.08)";

    const lockerId = h.lockerId ?? "";
    const action = h.action ?? "";
    const time = formatTime(h.timestamp || h.createdAt);

    li.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;">
        <div style="color:#fff;">Locker <b>${lockerId}</b></div>
        <div style="color:#4aa3ff;font-weight:600;">${action}</div>
      </div>
      <div style="margin-top:6px;color:#aaa;font-size:13px;">${time}</div>
    `;
    listEl.appendChild(li);
  });
}

async function fetchHistory(userId) {
  const url = `${API}/history/${encodeURIComponent(userId)}`;
  const res = await fetch(url);

  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();

  if (!res.ok) throw new Error(`HTTP ${res.status} - ${text || "Not OK"}`);

  if (!contentType.includes("application/json")) {
    throw new Error(`Response không phải JSON: ${text.slice(0, 80)}...`);
  }

  const data = JSON.parse(text);
  if (!data.success || !Array.isArray(data.history)) {
    throw new Error(data.error || "Invalid JSON structure (history)");
  }

  return data.history;
}

function wireBackButton() {
  const btn = document.getElementById("back-to-detail-btn");
  if (!btn) return;

  btn.addEventListener("click", (e) => {
    e.preventDefault();

    // ưu tiên: return=... từ query
    const url = new URL(window.location.href);
    const returnUrl =
      url.searchParams.get("return") || url.searchParams.get("from");
    if (returnUrl) {
      window.location.href = returnUrl;
      return;
    }

    // fallback: có lockerId thì về detail.html?lockerId=xx
    const lockerId = getLockerIdHint();
    if (lockerId) {
      window.location.href = `./detail.html?lockerId=${encodeURIComponent(
        lockerId
      )}`;
      return;
    }

    // fallback cuối: về index
    window.location.href = "./index.html";
  });
}

async function loadHistory() {
  const listEl = document.getElementById("historyList");
  if (!listEl) return;

  const user = getCurrentUser();
  const userId = getUserId(user);

  if (!userId) {
    listEl.innerHTML =
      '<li style="text-align:center;color:#aaa;">Bạn chưa đăng nhập.</li>';
    window.location.href = "./logon.html";
    return;
  }

  // loading UI
  listEl.innerHTML =
    '<li style="text-align:center;color:#aaa;">Loading history...</li>';

  try {
    const history = await fetchHistory(userId);
    renderHistory(listEl, history);
  } catch (err) {
    console.error("❌ loadHistory error:", err);
    listEl.innerHTML = `<li style="text-align:center;color:#ff8080;">
      Không tải được lịch sử: ${err.message}
    </li>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setLockerTitle();
  wireBackButton();
  loadHistory();

  // ✅ tự đồng bộ mỗi 5s
  setInterval(loadHistory, 5000);
});
