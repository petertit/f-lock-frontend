// scripts/face_id.js (FIXED - no takeBtnn, safe DOM, module-ready)
import { API_BASE } from "../api/api.js";

document.addEventListener("DOMContentLoaded", () => {
  const takeBtn = document.querySelector(".take-btn");
  const cameraWrapper = document.querySelector(".face-scan-wrapper");
  const statusEl = document.querySelector("#status");
  const imgPreview = document.querySelector("#cameraPreview"); 

  if (!takeBtn || !cameraWrapper || !statusEl) {
    console.error("Missing elements: .take-btn / .face-scan-wrapper / #status");
    return;
  }

  const BRIDGE_SERVER = `${API_BASE}/raspi`;
  const RASPI_NGROK = "https://adelaida-gymnogynous-gnostically.ngrok-free.dev";
  const MAX_CAPTURES = 5;

  let mediaStream = null;
  let isRasPiMode = false;
  let done = false;

  
  const getToken = () => sessionStorage.getItem("token");
  const getUser = () => {
    try {
      return JSON.parse(sessionStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  };
  const normalizeName = (raw) =>
    String(raw || "unknown")
      .trim()
      .replace(/\s+/g, "_")
      .toLowerCase();

  const setStatus = (t, color = "#00ffff") => {
    statusEl.textContent = t;
    statusEl.style.color = color;
  };

  const setButton = (t, disabled = false) => {
    takeBtn.textContent = t;
    takeBtn.disabled = disabled;
  };

  const detectMode = () => {
    const host = window.location.hostname;
    const href = window.location.href;

    if (
      href.startsWith(RASPI_NGROK) ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      /^192\.168\./.test(host)
    ) {
      return true;
    }
    return false;
  };

  const stopLaptopCamera = () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    const v = document.querySelector("#laptopCamera");
    if (v) v.srcObject = null;
  };

  function captureOvalFromVideo(videoEl, opts = {}) {
    const {
      cx = 0.5,
      cy = 0.48,
      ow = 0.66,
      oh = 0.82,
      outW = 360,
      outH = 480,
      quality = 0.9,
    } = opts;

    const vw = videoEl.videoWidth || 640;
    const vh = videoEl.videoHeight || 480;

    const boxW = vw * ow;
    const boxH = vh * oh;

    let boxX = vw * cx - boxW / 2;
    let boxY = vh * cy - boxH / 2;

    
    boxX = Math.max(0, Math.min(boxX, vw - boxW));
    boxY = Math.max(0, Math.min(boxY, vh - boxH));

    const c = document.createElement("canvas");
    c.width = outW;
    c.height = outH;
    const ctx = c.getContext("2d");

    
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, outW, outH);

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
    ctx.clip();

    ctx.drawImage(videoEl, boxX, boxY, boxW, boxH, 0, 0, outW, outH);
    ctx.restore();

    return c.toDataURL("image/jpeg", quality);
  }

  async function captureFramesFromVideo(videoEl, count = MAX_CAPTURES) {
    const images = [];
    for (let i = 0; i < count; i++) {
    
      if ((videoEl.videoWidth || 0) < 10) {
        await new Promise((r) => setTimeout(r, 120));
        i--;
        continue;
      }

      const dataUrl = captureOvalFromVideo(videoEl);
      images.push(dataUrl.split(",")[1]);

      await new Promise((r) => setTimeout(r, 200));
    }
    return images;
  }

  async function postJson(endpoint, body, timeoutMs = 120000) {
    const token = getToken();
    if (!token) throw new Error("Missing token. Please login again.");

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        signal: ctrl.signal,
        body: JSON.stringify(body || {}),
      });

      const ct = res.headers.get("content-type") || "";
      const text = await res.text().catch(() => "");

      let data = {};
      if (ct.includes("application/json")) {
        try {
          data = JSON.parse(text || "{}");
        } catch {
          data = {};
        }
      }

      if (!res.ok) {
        
        throw new Error(
          data?.error || data?.message || text || `HTTP ${res.status}`
        );
      }

      return data;
    } catch (e) {
    
      if (e?.name === "AbortError") {
        throw new Error(
          "Timeout: Train quá lâu, tăng timeout hoặc tối ưu train."
        );
      }
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  async function startLaptopCamera() {
    let video = document.querySelector("#laptopCamera");
    if (!video) {
      video = document.createElement("video");
      video.id = "laptopCamera";
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.style.width = "100%";
      video.style.height = "100%";
      cameraWrapper.appendChild(video);
    }

    if (imgPreview) {
      imgPreview.style.display = "none";
      imgPreview.removeAttribute("src");
    }

    video.style.display = "block";

    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });

    video.srcObject = mediaStream;
    await video.play();
    setStatus("🎥 Live stream from Camera", "#00ffff");
  }

  function startRaspiStreamPreview() {
    stopLaptopCamera();
    const video = document.querySelector("#laptopCamera");
    if (video) video.style.display = "none";

    if (!imgPreview) {
      setStatus("❌ Missing #cameraPreview", "#ff3333");
      return;
    }

    const base = window.location.href.startsWith(RASPI_NGROK)
      ? RASPI_NGROK
      : window.location.origin;

    imgPreview.src = `${base}/video_feed`;
    imgPreview.style.display = "block";

    setStatus("🎥 Live stream from Raspberry Pi", "#00ffff");
  }


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

  (async () => {
    try {
      if (isRasPiMode) startRaspiStreamPreview();
      else await startLaptopCamera();
    } catch (e) {
      console.error(e);
      setStatus("❌ Không mở được camera. Hãy cấp quyền.", "#ff3333");
    }
  })();

  takeBtn.addEventListener("click", async () => {
    if (done) return;

    try {
      setButton("⏳ Đang chụp & train...", true);
      setStatus("📸 Đang chụp 5 ảnh và train... giữ yên nhé.", "#ffaa00");

      const lockerId =
        sessionStorage.getItem("locker_to_open") ||
        sessionStorage.getItem("selectedLocker") ||
        sessionStorage.getItem("lockerId") ||
        null;

      if (!isRasPiMode) {
        const videoEl = document.querySelector("#laptopCamera");
        if (!videoEl || !mediaStream)
          throw new Error("Laptop camera not ready");

        const images = await captureFramesFromVideo(videoEl, MAX_CAPTURES);

        const data = await postJson(`${BRIDGE_SERVER}/capture-remote-batch`, {
          name: username,
          images_data: images,
          count: MAX_CAPTURES,
          ...(lockerId ? { lockerId } : {}),
        });

        if (data?.success === false)
          throw new Error(data?.error || "Train failed");
      } else {
        const data = await postJson(`${BRIDGE_SERVER}/capture-batch`, {
          name: username,
          count: MAX_CAPTURES,
          ...(lockerId ? { lockerId } : {}),
        });
        if (data?.success === false)
          throw new Error(data?.error || "Train failed");
      }

      done = true;
      localStorage.setItem(doneKey, "1");
      setStatus("✅ Train thành công! Khuôn mặt đã được lưu.", "#00ff66");
      setButton("✅ Hoàn thành (Đã Train)", true);
    } catch (e) {
      console.error(e);
      setStatus("❌ " + (e?.message || "Capture failed"), "#ff3333");
      setButton(`📸 Chụp (0/${MAX_CAPTURES})`, false);
    }
  });

  window.addEventListener("beforeunload", () => stopLaptopCamera());
});
