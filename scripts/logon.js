document.addEventListener("DOMContentLoaded", () => {
  if (sessionStorage.getItem("user")) {
    window.location.href = "./index.html";
    return;
  }

  const form = document.getElementById("loginForm");
  if (!form) return;

  const API_BASE = "https://f-locker-backend.onrender.com";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email")?.value.trim();
    const password = document.getElementById("password")?.value.trim();

    if (!email || !password) {
      alert("❌ Please enter email and password");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const text = await res.text();
      let data;

      try {
        data = JSON.parse(text);
      } catch {
        console.error("Server returned non-JSON:", text);
        throw new Error(
          "Backend did not return JSON (wrong route or server error)"
        );
      }

      if (res.ok && data.user) {
        sessionStorage.setItem("user", JSON.stringify(data.user));
        if (data.token) {
          sessionStorage.setItem("token", data.token);
        }

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
