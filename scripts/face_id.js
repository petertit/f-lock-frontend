// scripts/face_id.js (FINAL)
// - Uses JWT Authorization
// - Remote (laptop) mode: capture 5 oval-cropped frames -> POST /raspi/capture-remote-batch
// - Raspi mode: show MJPEG preview (optional) + POST /raspi/capture-batch (optional)
// - Saves "done" to localStorage per user

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
  const RASPI_NGROK = "https://adelaida-gymnogynous-gnostically.ngrok-free.dev";
  const MAX_CAPTURES = 5;

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

  function detectMode() {
    const host = window.location.hostname;
    const href = window.location.href;

    if (
      href.startsWith(RASPI_NGROK) ||
      host === "localhost" ||
      host === "127.0.0.1"
    ) {
      return true;
    }
    if (/^192\.168\./.test(host)) return true;

    return false;
  }

  function stopLaptopCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    const videoEl = document.querySelector("#laptopCamera");
    if (videoEl) videoEl.srcObject = null;
  }

  // ====== Oval capture helper (clamped) ======
  function captureOvalFromVideo(videoEl, opts = {}) {
    const {
      // MUST match your CSS oval in 4:3 fixed frame:
      cx = 0.5,
      cy = 0.48,
      ow = 0.66,
      oh = 0.82,

      outW = 360,
      outH = 480,

      jpeg = true,
      quality = 0.9,
    } = opts;

    const vw = videoEl.videoWidth || 640;
    const vh = videoEl.videoHeight || 480;

    const boxW = vw * ow;
    const boxH = vh * oh;

    let boxX = vw * cx - boxW / 2;
    let boxY = vh * cy - boxH / 2;

    // clamp to bounds (avoid negative crop)
    boxX = Math.max(0, Math.min(boxX, vw - boxW));
    boxY = Math.max(0, Math.min(boxY, vh - boxH));

    const c = document.createElement("canvas");
    c.width = outW;
    c.height = outH;
    const ctx = c.getContext("2d");

    if (jpeg) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, outW, outH);
    }

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(
      outW / 2,
      outH / 2,
      outW * 0.5 * 0.98,
      outH * 0.5 * 0.98,
      0,
      0,
      Math.PI * 2
    );
    ctx.closePath();
    ctx.clip();

    ctx.drawImage(videoEl, boxX, boxY, boxW, boxH, 0, 0, outW, outH);
    ctx.restore();

    return jpeg ? c.toDataURL("image/jpeg", quality) : c.toDataURL("image/png");
  }

  async function captureFramesFromVideo(
    videoEl,
    count = MAX_CAPTURES,
    delayMs = 200
  ) {
    const images = [];

    for (let i = 0; i < count; i++) {
      // wait until video has real dimensions
      if ((videoEl.videoWidth || 0) < 10) {
        await new Promise((r) => setTimeout(r, 120));
        i--;
        continue;
      }

      const dataUrl = captureOvalFromVideo(videoEl, {
        cx: 0.5,
        cy: 0.48,
        ow: 0.66,
        oh: 0.82,
        outW: 360,
        outH: 480,
        jpeg: true,
        quality: 0.9,
      });

      images.push(dataUrl.split(",")[1]); // base64 only
      await new Promise((r) => setTimeout(r, delayMs));
    }

    return images;
  }

  async function postJson(endpoint, body) {
    const token = getToken();
    if (!token) throw new Error("Missing token. Please login again.");

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body || {}),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
    }
    return data;
  }

  async function startLaptopCamera() {
    // Prefer using an existing <video id="laptopCamera"> if you added it in HTML.
    // If not exist, create it once.
    let video = document.querySelector("#laptopCamera");
    const img = document.querySelector("img#cameraPreview");

    if (!video) {
      video = document.createElement("video");
      video.id = "laptopCamera";
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;

      // If you already use .camera-frame, just append inside it.
      const frame = document.querySelector(".camera-frame") || cameraWrapper;
      frame.appendChild(video);
    }

    // Hide raspi img to avoid showing alt text
    if (img) {
      img.style.display = "none";
      img.removeAttribute("src");
    }

    video.style.display = "block";

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
    const img = document.querySelector("img#cameraPreview");
    const video = document.querySelector("#laptopCamera");

    // Hide laptop video if exists
    if (video) video.style.display = "none";
    stopLaptopCamera();

    if (!img) {
      setStatus("❌ Missing camera preview element.", "#ff3333");
      return;
    }

    const base = window.location.href.startsWith(RASPI_NGROK)
      ? RASPI_NGROK
      : window.location.origin;

    img.src = `${base}/video_feed`;
    img.style.display = "block";

    setStatus("🎥 Live stream from Raspberry Pi", "#00ffff");
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
    const doneKey = `face_done_${username}`;
    done = localStorage.getItem(doneKey) === "1";

    isRasPiMode = detectMode();

    if (done) {
      setButton("✅ Đã train xong", true);
      setStatus("✅ Khuôn mặt đã được train trước đó.", "#00ff66");
      return;
    }

    setButton(`📸 Chụp (0/${MAX_CAPTURES})`, false);
    setStatus("🔄 Checking camera mode...", "#00ffff");

    if (isRasPiMode) {
      console.log("Mode: Raspberry Pi Camera (Local/Ngrok)");
      startRaspiStreamPreview();
    } else {
      console.log("Mode: Laptop Camera (Remote)");
      startLaptopCamera();
    }

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

        const lockerId =
          sessionStorage.getItem("locker_to_open") ||
          sessionStorage.getItem("selectedLocker") ||
          sessionStorage.getItem("lockerId") ||
          null;

        if (!isRasPiMode) {
          if (!mediaStream) throw new Error("Laptop camera is not ready.");

          const videoEl = document.querySelector("#laptopCamera");
          if (!videoEl) throw new Error("Missing #laptopCamera element.");

          const images = await captureFramesFromVideo(
            videoEl,
            MAX_CAPTURES,
            200
          );

          const endpoint = `${BRIDGE_SERVER}/capture-remote-batch`;
          const body = {
            name: username2,
            images_data: images,
            count: MAX_CAPTURES,
            ...(lockerId ? { lockerId } : {}),
          };

          const data = await postJson(endpoint, body);

          if (data?.success === false) {
            throw new Error(data?.error || "Failed to capture/train");
          }

          done = true;
          localStorage.setItem(`face_done_${username2}`, "1");
          setStatus("✅ Train thành công! Khuôn mặt đã được lưu.", "#00ff66");
          setButton("✅ Hoàn thành (Đã Train)", true);
        } else {
          // Raspi mode (optional)
          const endpoint = `${BRIDGE_SERVER}/capture-batch`;
          const body = {
            name: username2,
            count: MAX_CAPTURES,
            ...(lockerId ? { lockerId } : {}),
          };

          const data = await postJson(endpoint, body);

          if (data?.success === false) {
            throw new Error(data?.error || "Failed to capture/train");
          }

          done = true;
          localStorage.setItem(`face_done_${username2}`, "1");
          setStatus("✅ Train thành công! Khuôn mặt đã được lưu.", "#00ff66");
          setButton("✅ Hoàn thành (Đã Train)", true);
        }
      } catch (err) {
        console.error("Capture/train error:", err);
        setStatus("❌ " + (err?.message || "Capture failed"), "#ff3333");
        setButton(`📸 Chụp (0/${MAX_CAPTURES})`, false);
      }
    });
  }

  window.addEventListener("beforeunload", () => {
    stopLaptopCamera();
  });

  init();
});
