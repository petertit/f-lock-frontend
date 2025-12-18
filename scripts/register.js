// register.js
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("registerForm");
  if (!form) return;

  // CAPTCHA setup
  const canvas = document.getElementById("captchaCanvas");
  const refreshBtn = document.getElementById("refreshCaptcha");
  const audioBtn = document.getElementById("audioCaptcha");
  const captchaInput = document.getElementById("captchaInput");
  const ctx = canvas.getContext("2d");

  const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let currentCaptcha = "";

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function generateCaptcha(length = 5) {
    let s = "";
    for (let i = 0; i < length; i++) {
      s += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
    }
    return s;
  }

  function drawCaptcha(text) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0b0b0b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const baseSize = Math.min(48, canvas.width / (text.length + 1));
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const fontSize = baseSize + randomInt(-6, 6);
      ctx.font = `${fontSize}px 'Epilogue', sans-serif`;
      ctx.fillStyle = `rgba(${randomInt(180, 255)},${randomInt(
        180,
        255
      )},${randomInt(180, 255)},0.95)`;
      const x = (canvas.width / (text.length + 1)) * (i + 1);
      const y = canvas.height / 2 + randomInt(-6, 6);
      ctx.save();
      const angle = (randomInt(-20, 20) * Math.PI) / 180;
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillText(ch, -fontSize / 2, 0);
      ctx.restore();
    }
  }

  function refreshCaptcha() {
    currentCaptcha = generateCaptcha(5);
    drawCaptcha(currentCaptcha);
    captchaInput.value = "";
  }

  function speakCaptcha() {
    const utter = new SpeechSynthesisUtterance(
      currentCaptcha.split("").join(" ")
    );
    utter.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }

  refreshBtn.addEventListener("click", refreshCaptcha);
  audioBtn.addEventListener("click", speakCaptcha);
  refreshCaptcha();

  // FORM SUBMIT
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const userCaptcha = (captchaInput.value || "").trim().toUpperCase();

    if (!userCaptcha) {
      alert("Please enter the captcha code.");
      return;
    }
    if (userCaptcha !== currentCaptcha.toUpperCase()) {
      alert("Captcha is incorrect. Please try again.");
      refreshCaptcha();
      return;
    }

    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const password = document.getElementById("password").value.trim();
    const hint = document.getElementById("hint").value.trim();

    try {
      const res = await fetch(
        "https://smart-locker-kgnx.onrender.com/register",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, phone, password, hint }),
        }
      );

      const data = await res.json();

      if (res.ok && data.user) {
        alert("✅ Registration successful! Please log in to continue.");

        // ✅ KHÔNG lưu session khi register
        sessionStorage.removeItem("user");
        sessionStorage.removeItem("locker_to_open");

        // ✅ Chuyển về trang đăng nhập
        window.location.href = "logon.html";
      } else {
        alert("❌ " + (data.error || "Register failed"));
        refreshCaptcha();
      }
    } catch (err) {
      alert("❌ Fetch error: " + err.message);
      refreshCaptcha();
    }
  });
});
