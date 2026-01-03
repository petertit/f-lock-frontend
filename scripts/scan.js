// scripts/scan.js (FINAL - matches scan.html + oval crop)

const BACKEND = "https://f-locker-backend.onrender.com";

let stream = null;
let usingFront = true;
let busy = false;
let timer = null;

// elements
let videoEl = null; // #userCamera
let raspiImgEl = null; // #raspiCamera (optional)
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

function requireLogin() {
  alert("⚠️ Bạn cần đăng nhập trước!");
  window.location.href = "./logon.html";
}

/**
 * Capture ONLY oval region from a video element.
 * Returns dataURL (data:image/jpeg;base64,...)
 *
 * opts must match your CSS oval position:
 *  - center at (50%, 46%)
 *  - size: 68% width, 86% height
 */
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

  // bounding box of oval in source coordinates
  const boxW = vw * ow;
  const boxH = vh * oh;
  let boxX = vw * cx - boxW / 2;
  let boxY = vh * cy - boxH / 2;

  // clamp to video bounds to avoid negative crop
  boxX = Math.max(0, Math.min(boxX, vw - boxW));
  boxY = Math.max(0, Math.min(boxY, vh - boxH));

  const c = document.createElement("canvas");
  c.width = outW;
  c.height = outH;
  const ctx = c.getContext("2d");

  // Fill black background for JPEG (no alpha)
  if (jpeg) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, outW, outH);
  }

  // Clip ellipse (oval)
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

  // Draw the oval bounding box from source -> full output canvas
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

  const lockerId = sessionStorage.getItem("locker_to_open") || null;

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
    if (!stream || !videoEl) return;
    if (busy) return;

    try {
      busy = true;

      // wait until camera is really ready
      if ((videoEl.videoWidth || 0) < 10) return;

      // ✅ ONLY send oval-cropped image
      const frameDataUrl = captureOvalFromVideo(videoEl, {
        cx: 0.5,
        cy: 0.46,
        ow: 0.68,
        oh: 0.86,
        outW: 320,
        outH: 420,
        jpeg: true,
        quality: 0.75,
      });

      const data = await postRecognize(frameDataUrl);

      if (data?.success || data?.matched) {
        setStatus("✅ Nhận diện thành công! Đang mở tủ...");

        const lockerId =
          data?.lockerId || sessionStorage.getItem("locker_to_open");

        if (lockerId && typeof window.openLockerSuccess === "function") {
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

  // show UI
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
    console.error(e);
    setStatus("❌ Không mở được camera. Hãy cấp quyền camera.");
    alert("❌ Không mở được camera. Bạn hãy cấp quyền camera cho trang web.");
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
  if (!token || !user) {
    requireLogin();
    return;
  }

  // show controls (you had display:none)
  if (controlsEl) controlsEl.style.display = "flex";

  btnStartCam?.addEventListener("click", startCamera);
  btnSwitchCam?.addEventListener("click", switchCamera);

  // auto start
  startCamera();

  window.addEventListener("beforeunload", () => {
    stopLoop();
    stopCamera();
  });
});
