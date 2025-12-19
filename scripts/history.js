import { API_BASE } from "../api/api.js";
document.addEventListener("DOMContentLoaded", () => {
  const historyList = document.getElementById("historyList");
  const historyLockerName = document.getElementById("historyLockerName");
  const backBtn = document.getElementById("back-to-detail-btn");

  if (!historyList) return;

  const BASE_URL = API_BASE;

  const userRaw = sessionStorage.getItem("user");
  const user = userRaw ? JSON.parse(userRaw) : null;

  if (!user || !user.id) {
    historyList.innerHTML = `<li style="text-align: center; color: red;">Lỗi: Không tìm thấy người dùng. Vui lòng đăng nhập lại.</li>`;
    historyLockerName.textContent = "History Error";
    return;
  }

  historyLockerName.textContent = user.name + " History";

  async function fetchLockerHistory() {
    const HISTORY_URL = `${BASE_URL}/history/${user.id}`;

    try {
      const res = await fetch(HISTORY_URL);
      const data = await res.json();

      if (res.ok && data.history) {
        renderHistory(data.history);
      } else {
        historyList.innerHTML = `<li style="text-align: center; color: red;">❌ Lỗi tải lịch sử tủ khóa.</li>`;
      }
    } catch (err) {
      console.error("Fetch error:", err);
      historyList.innerHTML = `<li style="text-align: center; color: red;">❌ Lỗi kết nối server API.</li>`;
    }
  }

  function renderHistory(history) {
    historyList.innerHTML = "";
    if (history.length === 0) {
      historyList.innerHTML = `<li style="text-align: center; color: #aaa;">Chưa có sự kiện nào được ghi nhận.</li>`;
      return;
    }

    history.forEach((item) => {
      const li = document.createElement("li");
      const date = new Date(item.timestamp);
      const formattedDate = date.toLocaleDateString("vi-VN", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      let actionText = "";
      let color = "";

      const lockerIdText = item.lockerId ? ` (Tủ ${item.lockerId})` : "";

      switch (item.action) {
        case "OPENED":
          actionText = "ĐÃ MỞ KHÓA" + lockerIdText;
          color = "#00aa00";
          break;
        case "LOCKED":
          actionText = "ĐÃ ĐÓNG KHÓA" + lockerIdText;
          color = "#cc0000";
          break;
        case "REGISTERED":
          actionText = "ĐĂNG KÝ TÀI KHOẢN";
          color = "#1a73e8";
          break;
        default:
          actionText = item.action;
          color = "#aaa";
      }
      li.innerHTML = `
                <span class="history-list-span-action" style="color: ${color};">${actionText}</span>
                <span class="history-list-span-date">${formattedDate}</span>
            `;
      li.style.borderLeft = `5px solid ${color}`;

      historyList.appendChild(li);
    });
  }

  backBtn.addEventListener("click", () => {
    window.location.href = "detail.html";
  });

  fetchLockerHistory();
});
