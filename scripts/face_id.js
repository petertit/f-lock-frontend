// scripts/face_id.js (FIXED + COMPLETE)
// - Works with your face_id.html (img#cameraPreview, .take-btn, #status)
// - Uses JWT Authorization
// - Remote (laptop) mode: captures 5 frames -> POST /raspi/capture-remote-batch
// - Raspi mode: uses MJPEG stream if you are on Raspi/Ngrok, and POST /raspi/capture-batch (optional)
// NOTE: Backend must implement POST /raspi/capture-remote-batch (as discussed)

import { API_BASE } from "../api/api.js";

document.addEventListener("DOMContentLoaded", () => {
  const takeBtn = document.querySelector(".take-btn");
  const cameraWrapper = document.querySelector(".face-scan-wrapper");
  const statusEl = document.querySelector("#status");

  if (!takeBtn || !cameraWrapper || !statusEl) {
    console.error(
      "Missing required elements (.take-btn, .face-scan-wrapper, #status)"
    );
    return;
  }

  const BRIDGE_SERVER = `${API_BASE}/raspi`;

  // Nếu bạn chạy Raspi qua ngrok thì để đúng domain của bạn
  const RASPI_NGROK = "https://adelaida-gymnogynous-gnostically.ngrok-free.dev";

  // Số ảnh cần chụp để train
  const MAX_CAPTURES = 5;

  // Mỗi lần bấm nút sẽ chụp trọn bộ 5 ảnh (batch) rồi train 1 lần
  // => hoàn thành luôn 5/5 sau 1 lần bấm (đúng ý UI “Chụp (0/5)” nếu bạn muốn 5 lần batch thì đổi logic)
  // Ở đây mình làm theo chuẩn: 1 batch = đủ 5 ảnh = DONE.
  const ONE_CLICK_FINISH = true;

  let mediaStream = null;
  let isRasPiMode = false;
  let done = false;

  function getToken() {
    return sessionStorage.getItem("token");
  }

  function getUser() {
    try {
      return JSON.parse(sessionStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  }

  function normalizeName(raw) {
    return String(raw || "unknown")
      .trim()
      .replace(/\s+/g, "_")
      .toLowerCase();
  }

  function setStatus(text, color = "#00ffff") {
    statusEl.textContent = text;
    statusEl.style.color = color;
  }

  function setButton(label, disabled = false) {
    takeBtn.textContent = label;
    takeBtn.disabled = disabled;
  }

  function stopLaptopCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
  }

  function cleanupPreview() {
    // Giữ đúng design: dùng lại đúng ID #cameraPreview nếu có
    // Xóa preview cũ nếu nó là video do mình tạo
    const oldVideo = document.querySelector("#laptopCamera");
    if (oldVideo) oldVideo.remove();

    // img#cameraPreview có sẵn trong HTML, không xóa
  }

  function detectMode() {
    const host = window.location.hostname;
    const href = window.location.href;

    // Nếu chạy ngay trên Raspi hoặc ngrok -> Raspi mode
    if (
      href.startsWith(RASPI_NGROK) ||
      host === "localhost" ||
      host === "127.0.0.1"
    ) {
      return true;
    }

    // Nếu bạn truy cập bằng IP LAN 192.168.* trên Raspi
    if (/^192\.168\./.test(host)) return true;

    return false;
  }

  async function startLaptopCamera() {
    cleanupPreview();

    const video = document.createElement("video");
    video.id = "laptopCamera";
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.style.maxWidth = "90%";
    video.style.borderRadius = "10px";
    video.style.border = "2px solid #1a73e8";

    cameraWrapper.insertBefore(video, takeBtn);

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });

      video.srcObject = mediaStream;
      await video.play();

      setStatus("🎥 Live stream from Laptop Camera", "#00ffff");
    } catch (err) {
      console.error("Laptop camera error:", err);
      setStatus(
        "❌ Cannot access Laptop Camera. Check permissions.",
        "#ff3333"
      );
    }
  }

  function startRaspiStreamPreview() {
    cleanupPreview();

    const img = document.querySelector("img#cameraPreview");
    if (!img) {
      console.error("Missing img#cameraPreview in HTML");
      setStatus("❌ Missing camera preview element.", "#ff3333");
      return;
    }

    // ✅ SỬA LỖI: bạn không được set src về 127.0.0.1 khi đang remote.
    // Nếu đang chạy Raspi trực tiếp (localhost / LAN) => dùng origin hiện tại
    // Nếu đang qua ngrok => dùng ngrok domain
    const base = window.location.href.startsWith(RASPI_NGROK)
      ? RASPI_NGROK
      : window.location.origin;

    // MJPEG stream endpoint trên Raspi (bạn đang dùng /video_feed)
    img.src = `${base}/video_feed`;
    img.style.display = "block";
    img.style.maxWidth = "90%";
    img.style.borderRadius = "10px";
    img.style.border = "2px solid #1a73e8";

    setStatus("🎥 Live stream from Raspberry Pi", "#00ffff");
  }

  function captureFramesFromVideo(
    videoEl,
    count = MAX_CAPTURES,
    delayMs = 200
  ) {
    return new Promise(async (resolve) => {
      const images = [];
      for (let i = 0; i < count; i++) {
        const vw = videoEl.videoWidth || 640;
        const vh = videoEl.videoHeight || 480;

        const canvas = document.createElement("canvas");
        canvas.width = vw;
        canvas.height = vh;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(videoEl, 0, 0, vw, vh);

        // backend/Raspi thường nhận base64 không có prefix
        const b64 = canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
        images.push(b64);

        await new Promise((r) => setTimeout(r, delayMs));
      }
      resolve(images);
    });
  }

  async function postJson(endpoint, body) {
    const token = getToken();
    if (!token) throw new Error("Missing token. Please login again.");

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`, // ✅ quan trọng
      },
      body: JSON.stringify(body || {}),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error || data?.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  function init() {
    const token = getToken();
    const user = getUser();
    if (!token || !user) {
      alert("⚠️ Bạn cần đăng nhập trước!");
      window.location.href = "./logon.html";
      return;
    }

    const username = normalizeName(user?.name || user?.username);

    // lưu trạng thái hoàn thành theo user
    const doneKey = `face_done_${username}`;
    done = localStorage.getItem(doneKey) === "1";

    isRasPiMode = detectMode();

    if (done) {
      setButton("✅ Đã train xong", true);
      setStatus("✅ Khuôn mặt đã được train trước đó.", "#00ff66");
      return;
    }

    // UI init
    setButton(`📸 Chụp (0/${MAX_CAPTURES})`, false);
    setStatus("🔄 Checking camera mode...", "#00ffff");

    if (isRasPiMode) {
      console.log("Mode: Raspberry Pi Camera (Local/Ngrok)");
      startRaspiStreamPreview();
    } else {
      console.log("Mode: Laptop Camera (Remote)");
      startLaptopCamera();
    }

    // click handler
    takeBtn.addEventListener("click", async () => {
      if (done) return;

      const token2 = getToken();
      if (!token2) {
        alert("⚠️ Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.");
        window.location.href = "./logon.html";
        return;
      }

      const user2 = getUser();
      const username2 = normalizeName(user2?.name || user2?.username);

      try {
        setButton("⏳ Đang chụp & train...", true);
        setStatus(
          "📸 Đang chụp 5 tấm ảnh và train... Vui lòng giữ yên.",
          "#ffaa00"
        );

        // lockerId nếu bạn muốn gắn training theo locker
        const lockerId =
          sessionStorage.getItem("locker_to_open") ||
          sessionStorage.getItem("selectedLocker") ||
          sessionStorage.getItem("lockerId") ||
          null;

        if (!isRasPiMode) {
          // laptop mode: chụp từ webcam -> gửi backend
          if (!mediaStream) throw new Error("Laptop camera is not ready.");

          const videoEl = document.querySelector("#laptopCamera");
          if (!videoEl) throw new Error("Missing #laptopCamera element.");

          const images = await captureFramesFromVideo(
            videoEl,
            MAX_CAPTURES,
            200
          );

          // ✅ SỬA: endpoint đúng là /raspi/capture-remote-batch (POST)
          const endpoint = `${BRIDGE_SERVER}/capture-remote-batch`;

          // body theo kiểu bạn đang dùng
          const body = {
            name: username2,
            images_data: images,
            ...(lockerId ? { lockerId } : {}),
            count: MAX_CAPTURES,
          };

          const data = await postJson(endpoint, body);

          if (data?.success !== false) {
            // ✅ DONE
            done = true;
            localStorage.setItem(`face_done_${username2}`, "1");
            setStatus("✅ Train thành công! Khuôn mặt đã được lưu.", "#00ff66");
            setButton("✅ Hoàn thành (Đã Train)", true);
          } else {
            throw new Error(data?.error || "Failed to capture/train");
          }
        } else {
          // raspi mode: để endpoint này nếu Raspi/Backend bạn có
          // Nếu bạn chưa làm /capture-batch thì có thể đổi sang /capture-remote-batch luôn.
          const endpoint = `${BRIDGE_SERVER}/capture-batch`;

          const body = {
            name: username2,
            count: MAX_CAPTURES,
            ...(lockerId ? { lockerId } : {}),
          };

          const data = await postJson(endpoint, body);

          if (data?.success !== false) {
            done = true;
            localStorage.setItem(`face_done_${username2}`, "1");
            setStatus("✅ Train thành công! Khuôn mặt đã được lưu.", "#00ff66");
            setButton("✅ Hoàn thành (Đã Train)", true);
          } else {
            throw new Error(data?.error || "Failed to capture/train");
          }
        }

        // nếu bạn muốn: tự chuyển qua open.html sau khi train
        // window.location.href = "./open.html";
      } catch (err) {
        console.error("Capture/train error:", err);
        setStatus("❌ " + err.message, "#ff3333");
        setButton(`📸 Chụp (0/${MAX_CAPTURES})`, false);
      }
    });
  }

  window.addEventListener("beforeunload", () => {
    stopLaptopCamera();
  });

  init();
});
