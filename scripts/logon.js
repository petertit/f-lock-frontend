// scripts/logon.js
document.addEventListener("DOMContentLoaded", () => {
  const API_BASE = "https://f-locker-backend.onrender.com";

  function getUser() {
    try {
      return JSON.parse(sessionStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  }

  function isAdmin(user) {
    return (user?.email || "").toLowerCase() === "admin@gmail.com";
  }

  function redirectAfterLogin(user) {
    // ✅ Admin vào trang admin
    if (isAdmin(user)) {
      window.location.href = "./admin.html";
      return;
    }
    // ✅ User thường (bạn có thể đổi sang ./menu.html hoặc ./open.html tuỳ flow)
    window.location.href = "./index.html";
  }

  // ✅ Nếu đã có token + user => redirect theo role
  const token = sessionStorage.getItem("token");
  const user = getUser();
  if (token && user) {
    redirectAfterLogin(user);
    return;
  }

  const form = document.getElementById("loginForm");
  if (!form) return;

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
          120
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
      // ✅ Ưu tiên /auth/login, fallback /login
      let result;
      try {
        result = await tryLogin("/auth/login", { email, password });
        if (!result.res.ok) {
          throw new Error(
            result.data?.error || result.data?.message || "auth/login failed"
          );
        }
      } catch (_) {
        result = await tryLogin("/login", { email, password });
      }

      const { res, data } = result;

      // ✅ Chuẩn JWT: cần token + user
      const gotUser = data?.user || data?.data?.user || null;
      const gotToken = data?.token || data?.data?.token || null;

      if (res.ok && gotUser && gotToken) {
        sessionStorage.setItem("token", gotToken);
        sessionStorage.setItem("user", JSON.stringify(gotUser));

        alert("✅ Login successful");
        redirectAfterLogin(gotUser);
        return;
      }

      alert("❌ " + (data?.error || data?.message || "Login failed"));
    } catch (err) {
      console.error(err);
      alert("❌ Fetch error: " + err.message);
    }
  });
});
