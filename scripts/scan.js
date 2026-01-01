document.addEventListener("DOMContentLoaded", () => {
  const statusEl = document.querySelector("#status");

  const raspiImg = document.getElementById("raspiCamera");
  const video = document.getElementById("userCamera");

  const btnStart = document.getElementById("btnStartCam");
  const btnSwitch = document.getElementById("btnSwitchCam");
  const controls = document.getElementById("cameraControls");

  // ✅ Backend Render của bạn (đúng domain hiện tại)
  const BRIDGE_SERVER = "https://f-locker-backend.onrender.com/raspi";

  const userRaw = sessionStorage.getItem("user");
  const currentUser = userRaw ? JSON.parse(userRaw) : null;
  const token = sessionStorage.getItem("token");

  if (!currentUser) {
    alert("Chưa đăng nhập. Quay lại login.");
    window.location.href = "logon.html";
    return;
  }
  if (!token) {
    alert("Missing token. Hãy login lại.");
    window.location.href = "logon.html";
    return;
  }

  let mediaStream = null;
  let usingFront = true;
  let isRasPiMode = false;
  let pollTimer = null;
  let backoffMs = 1500;

  function setStatus(text, color = "#ccc") {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.style.color = color;
  }

  function authHeaders() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }

  /* =========================
     PHONE / LAPTOP CAMERA
     ========================= */
  async function startUserCamera() {
    try {
      if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());

      const constraints = {
        video: {
          facingMode: usingFront ? "user" : { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = mediaStream;
      await video.play();

      if (raspiImg) raspiImg.style.display = "none";
      if (video) video.style.display = "block";
      if (controls)
        controls.style.display = /iPhone|Android/i.test(navigator.userAgent)
          ? "flex"
          : "none";

      setStatus(
        usingFront ? "📱 Phone camera (Front)" : "📱 Phone camera (Back)",
        "#00ffff"
      );

      isRasPiMode = false;
      backoffMs = 1500;
      pollRecognition();
    } catch (err) {
      console.error(err);
      setStatus("❌ Không mở được camera", "#ff3330");
      alert("Không mở được camera. Hãy cấp quyền Camera.");
    }
  }

  btnStart?.addEventListener("click", startUserCamera);
  btnSwitch?.addEventListener("click", async () => {
    usingFront = !usingFront;
    await startUserCamera();
  });

  /* =========================
     RECOGNITION LOOP
     ========================= */
  async function pollRecognition() {
    if (pollTimer) clearTimeout(pollTimer);

    try {
      // --- 1) PHONE/LAPTOP MODE: gửi ảnh base64 ---
      if (!isRasPiMode) {
        if (!video || !video.videoWidth) {
          pollTimer = setTimeout(pollRecognition, 1200);
          return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0);
        const base64 = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];

        setStatus("🔄 Đang gửi ảnh nhận diện...", "#ffaa00");

        const res = await fetch(`${BRIDGE_SERVER}/recognize-remote`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ image_data: base64 }),
        });

        const data = await safeJson(res);
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

        backoffMs = 1500; // reset backoff nếu ok
        handleResult(data);
        return;
      }

      // --- 2) RASPI MODE: gọi recognize (POST) ---
      setStatus("🔄 Đang nhận diện (Raspi)...", "#ffaa00");

      const res = await fetch(`${BRIDGE_SERVER}/recognize`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({}), // giữ JSON để server parse ổn
      });

      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      backoffMs = 1500;
      handleResult(data);
    } catch (err) {
      console.error("Recognize error:", err.message);
      setStatus("⚠️ Nhận diện lỗi — thử lại...", "#ffaa00");

      // backoff tăng dần để đỡ spam server
      backoffMs = Math.min(backoffMs + 800, 6000);
      pollTimer = setTimeout(pollRecognition, backoffMs);
    }
  }

  async function safeJson(res) {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return await res.json();
    const text = await res.text();
    return { raw: text };
  }

  function normalizeName(v) {
    return String(v || "")
      .trim()
      .toLowerCase();
  }

  function handleResult(data) {
    // data có thể trả về {success:true, name:"..."} hoặc {success:true, match:true, person:"..."}
    const detectedName = data?.name || data?.person || data?.user || "";
    const ok =
      data?.success === true &&
      normalizeName(detectedName) &&
      normalizeName(detectedName) === normalizeName(currentUser?.name);

    if (ok) {
      setStatus(`🔓 Welcome ${detectedName}`, "#00ff66");

      const lockerId = sessionStorage.getItem("locker_to_open");
      if (lockerId && typeof window.openLockerSuccess === "function") {
        window.openLockerSuccess(lockerId);
      } else {
        alert(
          "Nhận diện OK nhưng thiếu lockerId hoặc thiếu openLockerSuccess."
        );
      }
      return;
    }

    pollTimer = setTimeout(pollRecognition, 1800);
  }

  /* =========================
     INIT
     ========================= */
  // ✅ Bạn đang chạy trên pages.dev => dùng camera web
  // (Nếu muốn bật Raspi mode thật sự, bạn phải stream/public URL, không phải localhost)
  controls &&
    (controls.style.display = /iPhone|Android/i.test(navigator.userAgent)
      ? "flex"
      : "none");
  startUserCamera();
});
