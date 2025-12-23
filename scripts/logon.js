// logon.js
document.addEventListener("DOMContentLoaded", () => {
  // Nếu đã có token + user => vào index
  if (sessionStorage.getItem("token") && sessionStorage.getItem("user")) {
    window.location.href = "./index.html";
    return;
  }

  const form = document.getElementById("loginForm");
  if (!form) return;

  const API_BASE = "https://f-locker-backend.onrender.com";

  async function tryLogin(endpoint, payload) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let data = {};
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(
        `Backend did not return JSON. Endpoint=${endpoint}. Body=${text.slice(
          0,
          80
        )}...`
      );
    }
    return { res, data };
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email")?.value.trim();
    const password = document.getElementById("password")?.value.trim();

    if (!email || !password) {
      alert("❌ Please enter email and password");
      return;
    }

    try {
      // ✅ Ưu tiên /auth/login, fallback /login (do dự án bạn từng dùng cả 2)
      let result;
      try {
        result = await tryLogin("/auth/login", { email, password });
        if (!result.res.ok)
          throw new Error(result.data?.error || "auth/login failed");
      } catch (_) {
        result = await tryLogin("/login", { email, password });
      }

      const { res, data } = result;

      // ✅ Chuẩn JWT: cần có token + user
      if (res.ok && data.user) {
        if (data.token) sessionStorage.setItem("token", data.token);
        sessionStorage.setItem("user", JSON.stringify(data.user));

        alert("✅ Login successful");
        window.location.href = "./index.html";
      } else {
        alert("❌ " + (data.error || data.message || "Login failed"));
      }
    } catch (err) {
      alert("❌ Fetch error: " + err.message);
      console.error(err);
    }
  });
});
