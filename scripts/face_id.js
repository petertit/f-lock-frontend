import { API_BASE } from "../api/api.js";
document.addEventListener("DOMContentLoaded", () => {
  const takeBtn = document.querySelector(".take-btn");
  const cameraWrapper = document.querySelector(".face-scan-wrapper");
  const statusEl = document.querySelector("#status");
  const BRIDGE_SERVER = `${API_BASE}/raspi`;
  const RASPI_NGROK = "https://adelaida-gymnogynous-gnostically.ngrok-free.dev";
  const LOCAL_IP_CHECK = ["localhost", "127.0.0.1", "192.168."];
  const MAX_SUCCESS_CAPTURES = 5;

  let mediaStream = null;
  let isRasPiMode = false;
  let captureCount = 0;

  function updateCaptureStatus() {
    takeBtn.textContent = `📸 Chụp (${captureCount}/${MAX_SUCCESS_CAPTURES})`;
    if (captureCount >= MAX_SUCCESS_CAPTURES) {
      takeBtn.disabled = true;
      takeBtn.textContent = "✅ Hoàn thành 5 lần chụp (Đã Train)";
      statusEl.textContent =
        "✅ Đã đủ 5 lần chụp thành công. Khuôn mặt đã được train.";
      statusEl.style.color = "#00ff66";
    } else {
      takeBtn.disabled = false;
    }
  }

  function initialize() {
    const user = JSON.parse(sessionStorage.getItem("user"));
    const username = user?.name || user?.username || "unknown";
    const storageKey = `capture_count_${username}`;

    captureCount = parseInt(localStorage.getItem(storageKey) || "0", 10);

    const oldImg = document.querySelector("img#cameraPreview");
    if (oldImg) oldImg.remove();

    setupCameraInterface();
    updateCaptureStatus();
  }

  function setupCameraInterface() {
    const currentUrl = window.location.href;

    const isLocal =
      LOCAL_IP_CHECK.some((ip) => currentUrl.includes(ip)) ||
      currentUrl.includes(RASPI_NGROK);

    if (isLocal) {
      isRasPiMode = true;
      console.log("Mode: Raspberry Pi Camera (Local/Ngrok)");

      const img = document.createElement("img");
      img.id = "cameraPreview";

      img.src = `${currentUrl.split(":")[0]}://127.0.0.1:5000/video_feed`;
      img.alt = "Raspberry Pi Camera Preview";
      img.style.maxWidth = "90%";
      img.style.borderRadius = "10px";
      img.style.border = "2px solid #1a73e8";
      cameraWrapper.insertBefore(img, takeBtn);
      if (captureCount < MAX_SUCCESS_CAPTURES) {
        statusEl.textContent = "🎥 Live stream from Raspberry Pi";
        statusEl.style.color = "#00ffff";
      }
    } else {
      isRasPiMode = false;
      console.log("Mode: Laptop Camera (Remote)");

      const video = document.createElement("video");
      video.id = "laptopCamera";
      video.autoplay = true;
      video.style.maxWidth = "90%";
      video.style.borderRadius = "10px";
      video.style.border = "2px solid #1a73e8";
      cameraWrapper.insertBefore(video, takeBtn);
      if (captureCount < MAX_SUCCESS_CAPTURES) {
        startLaptopCamera(video);
      }
    }
  }

  async function startLaptopCamera(videoEl) {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoEl.srcObject = mediaStream;
      statusEl.textContent = "🎥 Live stream from Laptop Camera";
      statusEl.style.color = "#00ffff";
    } catch (err) {
      console.error("Lỗi truy cập camera:", err);
      statusEl.textContent =
        "❌ Cannot access Laptop Camera. Check permissions.";
      statusEl.style.color = "#ff3333";
    }
  }

  takeBtn.addEventListener("click", async () => {
    if (captureCount >= MAX_SUCCESS_CAPTURES) return;

    takeBtn.disabled = true;

    const user = JSON.parse(sessionStorage.getItem("user"));
    const rawUsername = user?.name || user?.username || "unknown";
    const username = rawUsername.replace(/\s/g, "_").toLowerCase();
    const storageKey = `capture_count_${username}`;

    statusEl.textContent =
      "📸 Đang chụp 5 tấm ảnh và train... Vui lòng giữ yên.";
    statusEl.style.color = "#ffaa00";

    let payload = { name: username };
    let endpoint;

    if (!isRasPiMode) {
      if (!mediaStream) {
        statusEl.textContent = "❌ Camera Laptop chưa sẵn sàng.";
        takeBtn.disabled = false;
        return;
      }

      const videoEl = document.querySelector("#laptopCamera");
      const images = [];

      for (let i = 0; i < 5; i++) {
        const canvas = document.createElement("canvas");
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;
        canvas
          .getContext("2d")
          .drawImage(videoEl, 0, 0, canvas.width, canvas.height);

        images.push(canvas.toDataURL("image/jpeg", 0.9).split(",")[1]);
        await new Promise((r) => setTimeout(r, 200));
      }

      payload.images_data = images;
      endpoint = `${BRIDGE_SERVER}/capture-remote-batch`;
    } else {
      endpoint = `${BRIDGE_SERVER}/capture-batch`;
    }

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        captureCount += 1;
        localStorage.setItem(storageKey, captureCount.toString());
        statusEl.textContent = `✅ Lần chụp #${captureCount} thành công! Đã lưu 5 ảnh và Train.`;
        statusEl.style.color = "#00ff66";
      } else {
        statusEl.textContent = "❌ " + (data.error || "Failed to capture");
        statusEl.style.color = "#ff3333";
      }
    } catch (err) {
      console.error("Fetch error:", err);
      statusEl.textContent =
        "❌ Cannot contact Raspberry Pi Bridge! Kiểm tra Ngrok và Render.";
      statusEl.style.color = "#ff3333";
    } finally {
      updateCaptureStatus();
    }
  });

  initialize();
});
