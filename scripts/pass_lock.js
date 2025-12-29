document.addEventListener("DOMContentLoaded", () => {
  const token = sessionStorage.getItem("token");
  const userRaw = sessionStorage.getItem("user");
  const user = userRaw ? JSON.parse(userRaw) : null;

  if (!user || !token) {
    alert("⚠️ Bạn cần đăng nhập trước khi mở tủ!");
    window.location.href = "logon.html";
    return;
  }

  const lockerId = sessionStorage.getItem("locker_to_open");
  if (!lockerId) {
    alert("Lỗi: Không tìm thấy tủ nào đang chờ mở. Đang quay lại...");
    window.location.href = "open.html";
    return;
  }

  const form = document.getElementById("loginLockerForm");
  const input = document.getElementById("lockerCode");
  const row3 = document.getElementById("row3");

  const API = "https://f-locker-backend.onrender.com"; // đổi theo API của bạn

  async function apiFetch(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    if (options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return fetch(`${API}${path}`, { ...options, headers });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const entered = input.value.trim();
    if (!entered) return alert("⚠️ Vui lòng nhập mã khóa tủ!");

    try {
      row3.textContent = "⏳ Đang kiểm tra mã...";
      row3.style.color = "#fff";

      // ✅ verify code ở backend
      const res = await apiFetch("/pass/verify", {
        method: "POST",
        body: JSON.stringify({ lockerId, lockerCode: entered }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        row3.textContent = "❌ Mã khóa không đúng!";
        row3.style.color = "#ff3333";
        return;
      }

      row3.textContent = "✅ Mã chính xác — Đang mở tủ...";
      row3.style.color = "#00ff66";

      // ✅ mở tủ (dùng hàm openLockerSuccess của open.js nếu có)
      if (window.openLockerSuccess) {
        await window.openLockerSuccess(lockerId);
      } else {
        window.location.href = "index.html";
      }
    } catch (err) {
      alert("❌ Lỗi kết nối: " + err.message);
    } finally {
      input.value = "";
    }
  });
});
