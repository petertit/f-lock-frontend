// detail.js — Quản lý tài khoản, mã khóa tủ, và số tủ đã đăng ký
document.addEventListener("DOMContentLoaded", async () => {
  const user = JSON.parse(sessionStorage.getItem("user"));
  if (!user) {
    alert("⚠️ Bạn cần đăng nhập trước.");
    window.location.href = "logon.html";
    return;
  }

  // ✅ LẤY THÊM ELEMENT MỚI
  const nameEl = document.getElementById("name");
  const emailEl = document.getElementById("email");
  const phoneEl = document.getElementById("phone");
  const passwordEl = document.getElementById("password");
  const hintEl = document.getElementById("hint");
  const lockerCodeEl = document.getElementById("lockerCode");
  const registeredLockerEl = document.getElementById("registeredLocker");

  const changeBtn = document.getElementById("change-btn");
  const saveBtn = document.getElementById("save-btn");
  const logoutBtn = document.getElementById("logout-btn");
  const backBtn = document.getElementById("back-btn");
  const historyBtn = document.getElementById("history-btn");

  // 🧠 Luôn lấy lại user mới nhất từ server
  try {
    const res = await fetch(
      `https://smart-locker-kgnx.onrender.com/user/${user.id}`
    );
    const data = await res.json();
    if (res.ok && data.user) {
      sessionStorage.setItem("user", JSON.stringify(data.user));
      Object.assign(user, data.user);
    }
  } catch (err) {
    console.warn("Không thể load lại thông tin user:", err.message);
  }

  // ✅ HIỂN THỊ THÊM THÔNG TIN MỚI
  nameEl.textContent = user.name || "";
  emailEl.textContent = user.email || "";
  phoneEl.textContent = user.phone || "";
  passwordEl.textContent = user.password || "";
  hintEl.textContent = user.hint || "";
  if (lockerCodeEl)
    lockerCodeEl.textContent = user.lockerCode || "Chưa thiết lập";
  if (registeredLockerEl)
    registeredLockerEl.textContent = user.registeredLocker || "Chưa đăng ký tủ";

  // ✅ CHO PHÉP CHỈNH SỬA ELEMENT MỚI
  changeBtn.addEventListener("click", () => {
    [
      nameEl,
      emailEl,
      phoneEl,
      passwordEl,
      hintEl,
      lockerCodeEl,
      registeredLockerEl,
    ].forEach((el) => {
      if (el) {
        el.contentEditable = true;
        el.style.borderBottom = "2px solid #0063ff";
      }
    });
    saveBtn.style.display = "inline-block";
  });

  // ✅ LƯU TRƯỜNG MỚI KHI BẤM SAVE
  saveBtn.addEventListener("click", async () => {
    const newData = {
      name: nameEl.textContent.trim(),
      email: emailEl.textContent.trim(),
      phone: phoneEl.textContent.trim(),
      password: passwordEl.textContent.trim(),
      hint: hintEl.textContent.trim(),
      lockerCode: lockerCodeEl
        ? lockerCodeEl.textContent.trim()
        : user.lockerCode,
      registeredLocker: registeredLockerEl
        ? registeredLockerEl.textContent.trim()
        : user.registeredLocker,
    };

    try {
      const res = await fetch("https://smart-locker-kgnx.onrender.com/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, ...newData }),
      });

      const data = await res.json();
      if (res.ok && data.user) {
        alert("✅ Cập nhật thành công!");
        sessionStorage.setItem("user", JSON.stringify(data.user));
        [
          nameEl,
          emailEl,
          phoneEl,
          passwordEl,
          hintEl,
          lockerCodeEl,
          registeredLockerEl,
        ].forEach((el) => {
          if (el) {
            el.contentEditable = false;
            el.style.borderBottom = "none";
          }
        });
        saveBtn.style.display = "none";
      } else {
        alert("❌ " + (data.error || "Không thể cập nhật"));
      }
    } catch (err) {
      alert("❌ Lỗi: " + err.message);
    }
  });

  // (Các nút Back, Logout, History không thay đổi)
  backBtn.addEventListener("click", () => (window.location.href = "menu.html"));
  logoutBtn.addEventListener("click", () => {
    sessionStorage.removeItem("user");
    alert("🔓 Bạn đã đăng xuất!");
    window.location.href = "logon.html";
  });

  historyBtn.addEventListener("click", () => {
    window.location.href = "history.html";
  });
});
