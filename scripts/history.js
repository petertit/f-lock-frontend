// scripts/history.js
import { API_BASE } from "../api/api.js";

const userRaw = sessionStorage.getItem("user");
const token = sessionStorage.getItem("token");

if (!userRaw || !token) {
  alert("Bạn chưa đăng nhập.");
  window.location.href = "./logon.html";
}

const user = JSON.parse(userRaw);
const userId = user._id || user.id;

const historyList = document.getElementById("historyList");
const lockerTitle = document.getElementById("historyLockerName");
const backBtn = document.getElementById("back-to-detail-btn");

async function loadHistory() {
  try {
    const res = await fetch(`${API_BASE}/auth/history/${userId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok)
      throw new Error(data?.error || data?.message || `HTTP ${res.status}`);

    if (!data.success || !Array.isArray(data.history)) {
      throw new Error(data?.error || "Invalid history data");
    }

    lockerTitle.textContent = user.registeredLocker
      ? `Locker ${user.registeredLocker}`
      : "Locker (Chưa đăng ký)";

    historyList.innerHTML = "";

    data.history.forEach((h) => {
      const li = document.createElement("li");
      li.className = "history-item";

      const action = String(h.action || "").toUpperCase();

      let color = "#aaa";
      let label = action;

      if (action.includes("OPEN") || action.includes("UNLOCK")) {
        color = "#22c55e";
        label = "OPEN";
      } else if (action.includes("LOCK") || action.includes("CLOSE")) {
        color = "#ef4444";
        label = "LOCK";
      }

      li.innerHTML = `
        <div class="history-row">
          <span class="history-action" style="color:${color};font-weight:600">
            ● ${label}
          </span>
          <span class="history-time">
            ${new Date(h.timestamp).toLocaleString()}
          </span>
        </div>
      `;

      historyList.appendChild(li);
    });

    if (data.history.length === 0) {
      historyList.innerHTML =
        "<li style='color:#aaa;text-align:center'>Chưa có lịch sử</li>";
    }
  } catch (err) {
    console.error("❌ Load history error:", err);
    historyList.innerHTML =
      "<li style='color:red;text-align:center'>Không tải được lịch sử</li>";
  }
}

backBtn?.addEventListener("click", () => {
  window.location.href = "./open.html";
});

document.addEventListener("DOMContentLoaded", loadHistory);
