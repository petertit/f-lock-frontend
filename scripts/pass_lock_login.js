// scripts/pass_lock_login.js
document.addEventListener("DOMContentLoaded", () => {
  const BACKEND = "https://f-locker-backend.onrender.com";

  function getToken() {
    return sessionStorage.getItem("token");
  }

  // ✅ heartbeat: giữ session locker sống
  let touchTimer = null;

  async function touchLocker() {
    const token = getToken();
    const lockerId = sessionStorage.getItem("locker_to_open");
    if (!token || !lockerId) return;

    try {
      await fetch(`${BACKEND}/lockers/touch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ lockerId }),
      });
    } catch (_) {}
  }

  function startTouchLoop() {
    if (touchTimer) clearInterval(touchTimer);
    touchTimer = setInterval(touchLocker, 20000);
    touchLocker();
  }

  function stopTouchLoop() {
    if (touchTimer) clearInterval(touchTimer);
    touchTimer = null;
  }

  // start touch khi vào trang
  startTouchLoop();

  // stop touch khi rời trang
  window.addEventListener("pagehide", stopTouchLoop);

  const user = JSON.parse(sessionStorage.getItem("user"));
  if (!user) {
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

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const entered = input.value.trim();

    if (!entered) {
      alert("⚠️ Vui lòng nhập mã khóa tủ!");
      return;
    }

    if (entered === user.lockerCode) {
      row3.textContent = "✅ Mã chính xác — Đang gửi lệnh mở tủ...";
      row3.style.color = "#00ff66";

      if (window.openLockerSuccess) {
        window.openLockerSuccess(lockerId);
      } else {
        alert("Lỗi: Không tìm thấy hàm openLockerSuccess. Không thể mở tủ.");
      }
    } else {
      row3.textContent = "❌ Mã khóa không đúng!";
      row3.style.color = "#ff3333";
    }

    input.value = "";
  });
});
