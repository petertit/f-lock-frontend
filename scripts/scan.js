// scan.js (FULL) — Fix: show local camera, correct element IDs, stable recognition loop

const BACKEND = "https://f-locker-backend.onrender.com";

// ===== Elements (match scan.html) =====
const raspiCam = document.getElementById("raspiCamera"); // <img id="raspiCamera">
const userCam =
  document.getElementById("userCamera") ||
  document.getElementById("cameraPreview") ||
  document.querySelector("video");

const statusEl = document.getElementById("status");

const btnStartCam = document.getElementById("btnStartCam"); // <button id="btnStartCam">
const btnSwitchCam = document.getElementById("btnSwitchCam"); // <button id="btnSwitchCam">

// ===== State =====
let stream = null;
let usingFront = true;
let isRecognizing = false;
let recognitionTimer = null;

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
  console.log(text);
}

function getToken() {
  return sessionStorage.getItem("token");
}

function requireLogin() {
  alert("⚠️ Bạn cần đăng nhập trước!");
  window.location.href = "./logon.html";
}

// ===== Camera =====
async function startLocalCamera() {
  if (!userCam) {
    console.error("Missing #userCamera (or video element).");
    alert("Lỗi: Không tìm thấy thẻ video để hiển thị camera.");
    return;
  }

  // stop old stream
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  setStatus("📷 Đang mở camera...");

  const constraints = {
    audio: false,
    video: {
      facingMode: usingFront ? "user" : "environment",
      width: { ideal: 640 },
      height: { ideal: 480 },
    },
  };

  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);

    // IMPORTANT: show the video (scan.html has display:none)
    userCam.style.display = "block";
    userCam.playsInline = true;
    userCam.muted = true;
    userCam.autoplay = true;

    userCam.srcObject = stream;
    await userCam.play();

    setStatus("✅ Camera ready. Đang nhận diện...");
    startRecognitionLoop();
  } catch (err) {
    console.error("getUserMedia error:", err);
    setStatus("❌ Không mở được camera. Hãy cấp quyền camera.");
    alert("❌ Không mở được camera. Bạn hãy cấp quyền camera cho trang web.");
  }
}

function stopLocalCamera() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  if (userCam) {
    userCam.srcObject = null;
    // keep display block (optional)
  }
}

async function switchCamera() {
  usingFront = !usingFront;
  await startLocalCamera();
}

// ===== Capture frame (reduce size to avoid 413) =====
function captureFrameJpegBlob(videoEl, maxW = 480, quality = 0.6) {
  return new Promise((resolve) => {
    const vw = videoEl.videoWidth || 640;
    const vh = videoEl.videoHeight || 480;

    const scale = Math.min(1, maxW / vw);
    const cw = Math.round(vw * scale);
    const ch = Math.round(vh * scale);

    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoEl, 0, 0, cw, ch);

    canvas.toBlob(
      (blob) => resolve(blob),
      "image/jpeg",
      quality // 0..1
    );
  });
}

// ===== Recognition API =====
async function postRecognize(blob) {
  const token = getToken();
  if (!token) throw new Error("Missing token");

  // send multipart form-data (best for server)
  const fd = new FormData();
  fd.append("image", blob, "frame.jpg");

  const lockerId = sessionStorage.getItem("locker_to_open") || null;
  if (lockerId) fd.append("lockerId", lockerId);

  const res = await fetch(`${BACKEND}/raspi/recognize-remote`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      // IMPORTANT: do NOT set Content-Type for FormData
    },
    body: fd,
  });

  // If server returns HTML (nginx) -> prevent JSON crash
  const ct = res.headers.get("content-type") || "";
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // show short error
    throw new Error(
      `HTTP ${res.status}${text ? " - " + text.slice(0, 80) : ""}`
    );
  }

  if (!ct.includes("application/json")) {
    const text = await res.text().catch(() => "");
    throw new Error("Response is not JSON: " + text.slice(0, 80));
  }

  return await res.json();
}

// ===== Loop =====
function startRecognitionLoop() {
  if (recognitionTimer) clearInterval(recognitionTimer);

  // avoid multiple loops
  isRecognizing = false;

  recognitionTimer = setInterval(async () => {
    if (!userCam || !stream) return;
    if (isRecognizing) return;

    try {
      isRecognizing = true;

      // wait video ready
      if ((userCam.videoWidth || 0) < 10) return;

      const blob = await captureFrameJpegBlob(userCam, 480, 0.6);
      if (!blob) return;

      const data = await postRecognize(blob);

      // Optional: show raspi returned preview if backend returns url/base64
      // (only if your backend supports it)
      if (raspiCam && data?.previewUrl) {
        raspiCam.src = data.previewUrl;
      }

      // SUCCESS
      if (data?.success || data?.matched) {
        setStatus("✅ Nhận diện thành công! Đang mở tủ...");

        // If you already use open.js callback
        const lockerId =
          data?.lockerId || sessionStorage.getItem("locker_to_open");
        if (lockerId && typeof window.openLockerSuccess === "function") {
          await window.openLockerSuccess(lockerId);
          return;
        }

        // fallback redirect
        window.location.href = "./index.html";
        return;
      }

      // NOT MATCH
      setStatus("❌ Chưa khớp — thử lại...");
    } catch (err) {
      // common: 413 too large, 401 missing token, 404 wrong route
      console.error("Recognize error:", err.message);
      setStatus("⚠️ Nhận diện lỗi — thử lại...");
    } finally {
      isRecognizing = false;
    }
  }, 1500); // 1.5s / frame
}

function stopRecognitionLoop() {
  if (recognitionTimer) clearInterval(recognitionTimer);
  recognitionTimer = null;
  isRecognizing = false;
}

// ===== Init =====
document.addEventListener("DOMContentLoaded", () => {
  const token = getToken();
  const user = sessionStorage.getItem("user");
  if (!token || !user) {
    requireLogin();
    return;
  }

  // Bind buttons (if exist)
  if (btnStartCam) btnStartCam.addEventListener("click", startLocalCamera);
  if (btnSwitchCam) btnSwitchCam.addEventListener("click", switchCamera);

  // Auto start (so user sees camera immediately)
  startLocalCamera();

  // Cleanup
  window.addEventListener("beforeunload", () => {
    stopRecognitionLoop();
    stopLocalCamera();
  });
});
