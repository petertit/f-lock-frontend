import { API_BASE } from "../api/api.js";

document.addEventListener("DOMContentLoaded", () => {
  const RENDER_BRIDGE = API_BASE;
  const userRaw = sessionStorage.getItem("user");
  const user = userRaw ? JSON.parse(userRaw) : null;
  if (!user || (!user.id && !user._id)) {
    alert(
      "⚠️ Vui lòng đăng nhập trước khi thiết lập mã tủ! (User session/ID missing)"
    );
    window.location.href = "logon.html";
    return;
  }

  const form = document.getElementById("lockerRegisterForm");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const lockerCode = document.getElementById("password").value.trim();

    const userId = user.id || user._id;

    if (!lockerCode) {
      alert("❌ Vui lòng nhập mã tủ!");
      return;
    }

    try {
      const res = await fetch(`${RENDER_BRIDGE}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId, lockerCode }),
      });

      const data = await res.json();
      if (res.ok && data.user) {
        sessionStorage.setItem("user", JSON.stringify(data.user));
        alert("✅ Đăng ký mã tủ thành công!");
        window.location.href = "menu.html";
      } else {
        alert(
          "❌ Đăng ký thất bại: " +
            (data.error || "Không thể cập nhật User ID.")
        );
      }
    } catch (err) {
      alert("❌ Lỗi mạng/server: " + err.message);
    }
  });
});
