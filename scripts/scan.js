// scripts/scan.js

const BACKEND = "https://f-locker-backend.onrender.com";

let stream = null;
let usingFront = true;
let busy = false;
let timer = null;

let touchTimer = null;

let videoEl = null;
let raspiImgEl = null;
let statusEl = null;
let btnStartCam = null;
let btnSwitchCam = null;
let controlsEl = null;

function setStatus(t) {
  if (statusEl) statusEl.textContent = t;
  console.log(t);
}

function getToken() {
  return sessionStorage.getItem("token");
}

function getLockerId() {
  return sessionStorage.getItem("locker_to_open");
}

function requireLogin() {
  alert("⚠️ Bạn cần đăng nhập trước!");
  window.location.href = "./logon.html";
}

async function touchLocker() {
  const token = getToken();
  const lockerId = getLockerId();
  if (!token || !lockerId) return;

  try {
    await fetch(`${BACKEND}/lockers/touch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ lockerId }),
    });
    console.log("[HEARTBEAT] touch", lockerId);
  } catch (e) {
    console.warn("[HEARTBEAT] failed");
  }
}

function startTouchLoop() {
  stopTouchLoop();
  touchTimer = setInterval(touchLocker, 20000);
  touchLocker();
}

function stopTouchLoop() {
  if (touchTimer) clearInterval(touchTimer);
  touchTimer = null;
}

function captureOvalFromVideo(videoEl, opts = {}) {
  const {
    cx = 0.5,
    cy = 0.46,
    ow = 0.68,
    oh = 0.86,
    outW = 320,
    outH = 420,
    jpeg = true,
    quality = 0.75,
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

  if (jpeg) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, outW, outH);
  }

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(outW / 2, outH / 2, outW * 0.49, outH * 0.49, 0, 0, Math.PI * 2);
  ctx.clip();

  ctx.drawImage(videoEl, boxX, boxY, boxW, boxH, 0, 0, outW, outH);
  ctx.restore();

  return jpeg ? c.toDataURL("image/jpeg", quality) : c.toDataURL("image/png");
}

function stopLoop() {
  if (timer) clearInterval(timer);
  timer = null;
  busy = false;
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  if (videoEl) videoEl.srcObject = null;
}

async function postRecognize(imageBase64) {
  const token = getToken();
  if (!token) throw new Error("Missing token");

  const lockerId = getLockerId();

  const res = await fetch(`${BACKEND}/raspi/recognize-remote`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ imageBase64, lockerId }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

function startLoop() {
  stopLoop();

  timer = setInterval(async () => {
    if (!stream || !videoEl || busy) return;

    try {
      busy = true;

      if ((videoEl.videoWidth || 0) < 10) return;

      const frameDataUrl = captureOvalFromVideo(videoEl);

      const data = await postRecognize(frameDataUrl);

      if (data?.success || data?.matched) {
        setStatus("✅ Nhận diện thành công! Đang mở tủ...");

        const lockerId = data?.lockerId || getLockerId();
        if (lockerId && typeof window.openLockerSuccess === "function") {
          stopTouchLoop();
          await window.openLockerSuccess(lockerId);
          return;
        }

        window.location.href = "./index.html";
        return;
      }

      setStatus("❌ Chưa khớp — thử lại...");
    } catch (e) {
      console.error("Recognize error:", e.message);
      setStatus("⚠️ Nhận diện lỗi — thử lại...");
    } finally {
      busy = false;
    }
  }, 1500);
}

async function startCamera() {
  videoEl = document.getElementById("userCamera");
  if (!videoEl) {
    alert("❌ Không tìm thấy thẻ video (#userCamera).");
    return;
  }

  videoEl.style.display = "block";
  if (controlsEl) controlsEl.style.display = "flex";
  if (raspiImgEl) raspiImgEl.style.display = "none";

  stopCamera();
  setStatus("📷 Đang mở camera...");

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: usingFront ? "user" : "environment",
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    });

    videoEl.srcObject = stream;
    videoEl.muted = true;
    videoEl.playsInline = true;
    await videoEl.play();

    setStatus("✅ Camera ready. Đang nhận diện...");
    startLoop();
  } catch (e) {
    setStatus("❌ Không mở được camera.");
    alert("❌ Không mở được camera. Hãy cấp quyền camera.");
  }
}

async function switchCamera() {
  usingFront = !usingFront;
  await startCamera();
}

document.addEventListener("DOMContentLoaded", () => {
  videoEl = document.getElementById("userCamera");
  raspiImgEl = document.getElementById("raspiCamera");
  statusEl = document.getElementById("status");
  btnStartCam = document.getElementById("btnStartCam");
  btnSwitchCam = document.getElementById("btnSwitchCam");
  controlsEl = document.getElementById("cameraControls");

  const token = getToken();
  const user = sessionStorage.getItem("user");
  const lockerId = getLockerId();

  if (!token || !user || !lockerId) {
    requireLogin();
    return;
  }

  if (controlsEl) controlsEl.style.display = "flex";

  btnStartCam?.addEventListener("click", startCamera);
  btnSwitchCam?.addEventListener("click", switchCamera);

  startTouchLoop();
  startCamera();

  window.addEventListener("pagehide", () => {
    stopTouchLoop();
    stopLoop();
    stopCamera();
  });
});
