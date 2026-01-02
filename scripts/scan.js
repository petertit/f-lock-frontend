// scripts/scan.js
const BACKEND = "https://f-locker-backend.onrender.com";

// Elements (theo scan.html bạn đưa)
const videoEl = document.getElementById("cameraPreview");
const statusEl = document.getElementById("status");
const btnStartCam = document.getElementById("btnStartCam");
const btnSwitchCam = document.getElementById("btnSwitchCam");

let stream = null;
let usingFront = true;
let busy = false;
let timer = null;

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

// Resize frame -> base64 JPEG
function captureFrameBase64(video, maxW = 420, quality = 0.55) {
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  const scale = Math.min(1, maxW / vw);

  const cw = Math.round(vw * scale);
  const ch = Math.round(vh * scale);

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, cw, ch);

  // data:image/jpeg;base64,...
  return canvas.toDataURL("image/jpeg", quality);
}

async function startCamera() {
  if (!videoEl) {
    alert("❌ Không tìm thấy thẻ video (#cameraPreview).");
    return;
  }

  // stop old
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

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

    videoEl.style.display = "block";
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

async function switchCamera() {
  usingFront = !usingFront;
  await startCamera();
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
    body: JSON.stringify({
      imageBase64,
      lockerId,
    }),
  });

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  const text = await res.text().catch(() => "");

  let data = null;
  if (ct.includes("application/json")) {
    try {
      data = JSON.parse(text);
    } catch (_) {}
  }

  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status} - ${
        data?.error || text.slice(0, 120) || "Request failed"
      }`
    );
  }

  return data || {};
}

function startLoop() {
  stopLoop();

  timer = setInterval(async () => {
    if (!stream || !videoEl) return;
    if (busy) return;

    try {
      busy = true;

      if ((videoEl.videoWidth || 0) < 10) return;

      const frame64 = captureFrameBase64(videoEl, 420, 0.55);
      const data = await postRecognize(frame64);

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

document.addEventListener("DOMContentLoaded", () => {
  const token = getToken();
  const user = sessionStorage.getItem("user");
  if (!token || !user) {
    requireLogin();
    return;
  }

  if (btnStartCam) btnStartCam.addEventListener("click", startCamera);
  if (btnSwitchCam) btnSwitchCam.addEventListener("click", switchCamera);

  // auto start
  startCamera();

  window.addEventListener("beforeunload", () => {
    stopLoop();
    stopCamera();
  });
});
