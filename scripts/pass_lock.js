document.addEventListener("DOMContentLoaded", () => {
  const userRaw = sessionStorage.getItem("user");
  const token = sessionStorage.getItem("token");

  if (!userRaw || !token) {
    alert("⚠️ Bạn cần đăng nhập trước khi mở tủ!");
    window.location.href = "logon.html";
    return;
  }

  const form = document.getElementById("loginLockerForm");
  const input = document.getElementById("lockerCode");
  const row3 = document.getElementById("row3");

  const lockerId = sessionStorage.getItem("locker_to_open");
  if (!lockerId) {
    alert("Lỗi: Không tìm thấy tủ nào đang chờ mở. Đang quay lại...");
    window.location.href = "open.html";
    return;
  }

  // ✅ API base
  const API = "https://f-locker-backend.onrender.com"; // đổi theo API_BASE của bạn

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

    if (!entered) {
      alert("⚠️ Vui lòng nhập mã khóa tủ!");
      return;
    }

    try {
      row3.textContent = "⏳ Đang kiểm tra mã...";
      row3.style.color = "#ffffff";

      // ✅ Gửi lên backend để verify (đúng chuẩn)
      // Bạn cần tạo endpoint này ở backend:
      // POST /pass/verify { lockerId, lockerCode }
      const res = await apiFetch("/pass/verify", {
        method: "POST",
        body: JSON.stringify({ lockerId, lockerCode: entered }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        row3.textContent = "❌ Mã khóa không đúng!";
        row3.style.color = "#ff3333";
        return;
      }

      row3.textContent = "✅ Mã chính xác — Đang mở tủ...";
      row3.style.color = "#00ff66";

      // ✅ Nếu backend đã mở tủ + update DB xong thì quay về index luôn
      // hoặc nếu bạn muốn vẫn dùng openLockerSuccess thì gọi nó ở đây:
      // if (window.openLockerSuccess) await window.openLockerSuccess(lockerId);

      alert(`🔓 Đã mở tủ ${lockerId} thành công!`);
      window.location.href = "index.html";
    } catch (err) {
      console.error(err);
      alert("❌ Lỗi kết nối: " + err.message);
      row3.textContent = "❌ Lỗi kết nối.";
      row3.style.color = "#ff3333";
    } finally {
      input.value = "";
    }
  });
});
