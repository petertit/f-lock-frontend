import { API_BASE } from "../api/api.js";

const API = API_BASE;

// ====== AUTH CHECK ======
const userRaw = sessionStorage.getItem("user");
if (!userRaw) {
  alert("Bạn chưa đăng nhập.");
  window.location.href = "./logon.html";
}

const user = JSON.parse(userRaw);
const userId = user._id || user.id;

const historyList = document.getElementById("historyList");
const lockerTitle = document.getElementById("historyLockerName");
const backBtn = document.getElementById("back-to-detail-btn");

// ====== LOAD HISTORY ======
async function loadHistory() {
  try {
    const res = await fetch(`${API}/history/${userId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (!data.success || !Array.isArray(data.history)) {
      throw new Error(data.error || "Invalid history data");
    }

    // ===== UI =====
    lockerTitle.textContent = user.registeredLocker
      ? `Locker ${user.registeredLocker}`
      : "Locker (Chưa đăng ký)";

    historyList.innerHTML = "";

    data.history.forEach((h) => {
      const li = document.createElement("li");
      li.className = "history-item";

      const action = h.action.toUpperCase();

      let color = "#aaa";
      let label = action;

      if (action.includes("OPEN")) {
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

    data.history.forEach((h) => {
      const li = document.createElement("li");
      li.className = "history-item";

      li.innerHTML = `
        <div>
          <strong>${h.action}</strong>
          <span style="color:#888;font-size:13px">
            ${new Date(h.timestamp).toLocaleString()}
          </span>
        </div>
      `;
      historyList.appendChild(li);
    });
  } catch (err) {
    console.error("❌ Load history error:", err);
    historyList.innerHTML =
      "<li style='color:red;text-align:center'>Không tải được lịch sử</li>";
  }
}

// ====== BACK BUTTON ======
backBtn.addEventListener("click", () => {
  window.location.href = "./open.html";
});

// ====== INIT ======
document.addEventListener("DOMContentLoaded", loadHistory);
