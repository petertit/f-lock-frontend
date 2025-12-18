// backend/scan.js – FINAL (RasPi + Laptop + Phone)

document.addEventListener("DOMContentLoaded", () => {
  const wrapper = document.querySelector(".face-scan-wrapper");
  const statusEl = document.querySelector("#status");

  const raspiImg = document.getElementById("raspiCamera");
  const video = document.getElementById("userCamera");

  const btnStart = document.getElementById("btnStartCam");
  const btnSwitch = document.getElementById("btnSwitchCam");
  const controls = document.getElementById("cameraControls");

  const BRIDGE_SERVER = "https://smart-locker-kgnx.onrender.com/raspi";
  const RASPI_STREAM = "http://127.0.0.1:5000/video_feed";

  const userRaw = sessionStorage.getItem("user");
  const currentUser = userRaw ? JSON.parse(userRaw) : null;

  if (!currentUser) {
    alert("Chưa đăng nhập. Quay lại login.");
    window.location.href = "logon.html";
    return;
  }

  let mediaStream = null;
  let usingFront = true;
  let isRasPiMode = false;
  let pollTimer = null;

  function setStatus(text, color = "#ccc") {
    statusEl.textContent = text;
    statusEl.style.color = color;
  }

  /* =========================
     MODE DETECTION
     ========================= */
  const isPhone = /iPhone|Android/i.test(navigator.userAgent);
  const isSecure = window.isSecureContext;

  if (!isSecure && !location.hostname.includes("localhost")) {
    setStatus("⚠️ Camera cần HTTPS", "#ffaa00");
  }

  /* =========================
     RASPBERRY PI MODE
     ========================= */
  function startRaspiCamera() {
    isRasPiMode = true;
    raspiImg.src = RASPI_STREAM;
    raspiImg.style.display = "block";
    video.style.display = "none";
    controls.style.display = "none";
    setStatus("🎥 Raspberry Pi Camera", "#00ffff");
    pollRecognition();
  }

  /* =========================
     PHONE / LAPTOP CAMERA
     ========================= */
  async function startUserCamera() {
    try {
      if (mediaStream) {
        mediaStream.getTracks().forEach((t) => t.stop());
      }

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

      raspiImg.style.display = "none";
      video.style.display = "block";
      controls.style.display = isPhone ? "flex" : "none";

      setStatus(
        usingFront ? "📱 Phone camera (Front)" : "📱 Phone camera (Back)",
        "#00ffff"
      );

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

    let endpoint = `${BRIDGE_SERVER}/recognize`;
    let method = "GET";
    let payload = null;

    if (!isRasPiMode) {
      if (!video.videoWidth) {
        pollTimer = setTimeout(pollRecognition, 1500);
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      const base64 = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];

      endpoint = `${BRIDGE_SERVER}/recognize-remote`;
      method = "POST";
      payload = { image_data: base64 };

      setStatus("🔄 Đang gửi ảnh...", "#ffaa00");
    } else {
      setStatus("🔄 Đang nhận diện...", "#ffaa00");
    }

    try {
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: payload ? JSON.stringify(payload) : undefined,
      });

      const data = await res.json();
      handleResult(data);
    } catch (err) {
      console.error(err);
      pollTimer = setTimeout(pollRecognition, 3000);
    }
  }

  function handleResult(data) {
    if (
      data.success &&
      data.name &&
      data.name.toLowerCase() === currentUser.name.toLowerCase()
    ) {
      setStatus(`🔓 Welcome ${data.name}`, "#00ff66");

      const lockerId = sessionStorage.getItem("locker_to_open");
      if (lockerId && typeof window.openLockerSuccess === "function") {
        window.openLockerSuccess(lockerId);
      } else {
        alert("Nhận diện OK nhưng thiếu lockerId.");
      }
    } else {
      pollTimer = setTimeout(pollRecognition, 2000);
    }
  }

  /* =========================
     INIT
     ========================= */
  if (location.hostname.includes("127.0.0.1")) {
    startRaspiCamera();
  } else {
    // phone / laptop
    controls.style.display = isPhone ? "flex" : "none";
    if (!isPhone) startUserCamera();
    else setStatus("📱 Nhấn 'Bật camera' để bắt đầu", "#ffaa00");
  }
});
