// logon.js
document.addEventListener("DOMContentLoaded", () => {
  // Nếu đã login (sessionStorage), chuyển về index luôn
  if (sessionStorage.getItem("user")) {
    window.location.href = "index.html";
    return;
  }

  const form = document.getElementById("loginForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    try {
      const res = await fetch("https://smart-locker-kgnx.onrender.com/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (res.ok && data.user) {
        // ✅ LƯU TRỰC TIẾP user object CHUẨN HÓA từ server (có user.id và user.lockerCode)
        sessionStorage.setItem("user", JSON.stringify(data.user));

        alert("✅ Login successful!");
        window.location.href = "index.html";
      } else {
        alert("❌ " + (data.error || "Login failed"));
      }
    } catch (err) {
      alert("❌ Fetch error: " + err.message);
    }
  });
});
