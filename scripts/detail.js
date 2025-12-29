// detail.js (FIXED) — JWT + correct routes + fallback

document.addEventListener("DOMContentLoaded", async () => {
  const API_BASE = "https://f-locker-backend.onrender.com";

  const rawUser = sessionStorage.getItem("user");
  const token = sessionStorage.getItem("token");

  if (!rawUser || !token) {
    alert("⚠️ Bạn cần đăng nhập trước.");
    window.location.href = "logon.html";
    return;
  }

  let user = JSON.parse(rawUser);

  // ===== Elements =====
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

  // ===== Helpers =====
  function getUserId() {
    return String(user?._id || user?.id || "");
  }

  async function apiFetch(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    headers.set("Authorization", `Bearer ${token}`);

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });
    return res;
  }

  async function fetchWithFallback(paths, options) {
    let lastErr = null;

    for (const p of paths) {
      try {
        const res = await apiFetch(p, options);
        const text = await res.text();
        let data = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          data = { raw: text };
        }

        // nếu route không tồn tại
        if (res.status === 404) continue;

        return { res, data, path: p };
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("No endpoint matched");
  }

  function render() {
    nameEl.textContent = user.name || "";
    emailEl.textContent = user.email || "";
    phoneEl.textContent = user.phone || "";
    passwordEl.textContent = user.password || "";
    hintEl.textContent = user.hint || "";

    if (lockerCodeEl)
      lockerCodeEl.textContent = user.lockerCode || "Chưa thiết lập";
    if (registeredLockerEl)
      registeredLockerEl.textContent =
        user.registeredLocker || "Chưa đăng ký tủ";
  }

  function setEditable(on) {
    [
      nameEl,
      emailEl,
      phoneEl,
      passwordEl,
      hintEl,
      lockerCodeEl,
      registeredLockerEl,
    ].forEach((el) => {
      if (!el) return;
      el.contentEditable = on ? "true" : "false";
      el.style.borderBottom = on ? "2px solid #0063ff" : "none";
    });

    saveBtn.style.display = on ? "inline-block" : "none";
  }

  // ===== 1) Load fresh user from server (IMPORTANT) =====
  try {
    const id = getUserId();
    if (!id) throw new Error("Missing user id in session");

    const { res, data } = await fetchWithFallback(
      [`/auth/user/${id}`, `/user/${id}`],
      { method: "GET" }
    );

    if (res.status === 401) {
      alert("⚠️ Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.");
      sessionStorage.removeItem("user");
      sessionStorage.removeItem("token");
      window.location.href = "logon.html";
      return;
    }

    if (res.ok && data.user) {
      user = data.user;
      sessionStorage.setItem("user", JSON.stringify(user));
    }
  } catch (err) {
    console.warn("Không thể load lại user:", err.message);
  }

  // render after refresh
  render();
  setEditable(false);

  // ===== UI events =====
  changeBtn?.addEventListener("click", () => setEditable(true));

  saveBtn?.addEventListener("click", async () => {
    const id = getUserId();
    if (!id) {
      alert("❌ Thiếu user id");
      return;
    }

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
      const { res, data } = await fetchWithFallback(
        ["/auth/update", "/update"],
        {
          method: "POST",
          body: JSON.stringify({ id, ...newData }),
        }
      );

      if (res.status === 401) {
        alert("⚠️ Missing/Expired token. Vui lòng đăng nhập lại.");
        sessionStorage.removeItem("user");
        sessionStorage.removeItem("token");
        window.location.href = "logon.html";
        return;
      }

      if (res.ok && data.user) {
        alert("✅ Cập nhật thành công!");
        user = data.user;
        sessionStorage.setItem("user", JSON.stringify(user));
        render();
        setEditable(false);
      } else {
        alert("❌ " + (data.error || data.message || "Không thể cập nhật"));
      }
    } catch (err) {
      alert("❌ Lỗi: " + err.message);
    }
  });

  backBtn?.addEventListener(
    "click",
    () => (window.location.href = "menu.html")
  );

  logoutBtn?.addEventListener("click", () => {
    sessionStorage.removeItem("user");
    sessionStorage.removeItem("token");
    alert("🔓 Bạn đã đăng xuất!");
    window.location.href = "logon.html";
  });

  historyBtn?.addEventListener("click", () => {
    window.location.href = "history.html";
  });
});
