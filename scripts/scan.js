// scan.js (FULL FIX)

const API_BASE = "https://f-locker-backend.onrender.com";
const RECOGNIZE_URL = `${API_BASE}/raspi/recognize-remote`;

function getToken() {
  return sessionStorage.getItem("token");
}
function getUser() {
  const raw = sessionStorage.getItem("user");
  return raw ? JSON.parse(raw) : null;
}
function getLockerToOpen() {
  return sessionStorage.getItem("locker_to_open");
}

function dataURLToBase64(dataURL) {
  const idx = dataURL.indexOf("base64,");
  return idx >= 0 ? dataURL.slice(idx + 7) : dataURL;
}

async function postRecognize(payload) {
  const token = getToken();

  const res = await fetch(RECOGNIZE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

document.addEventListener("DOMContentLoaded", async () => {
  const user = getUser();
  const lockerId = getLockerToOpen();

  if (!user) {
    alert("⚠️ Bạn cần đăng nhập trước.");
    window.location.href = "logon.html";
    return;
  }
  if (!lockerId) {
    alert("⚠️ Không có tủ cần mở. Quay lại Open Locker.");
    window.location.href = "open.html";
    return;
  }

  const video = document.querySelector("video");
  if (!video) {
    alert("❌ scan.html thiếu thẻ <video>.");
    return;
  }

  // (tuỳ bạn có id này hay không, không có cũng không sao)
  const statusEl = document.getElementById("statusText");

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  let busy = false;
  let timer = null;

  function setStatus(msg, color = "#ffd000") {
    if (statusEl) {
      statusEl.textContent = msg;
      statusEl.style.color = color;
    } else {
      console.log(msg);
    }
  }

  async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
  }

  function captureSmallBase64() {
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;

    const maxW = 320;
    const scale = Math.min(1, maxW / vw);

    const w = Math.round(vw * scale);
    const h = Math.round(vh * scale);

    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(video, 0, 0, w, h);

    // quality thấp để tránh 413
    const dataURL = canvas.toDataURL("image/jpeg", 0.45);
    return dataURLToBase64(dataURL);
  }

  async function poll() {
    if (busy) return;
    busy = true;

    try {
      const img = captureSmallBase64();

      const payload = {
        imageBase64: img,
        lockerId,
        userId: user._id || user.id || null,
        email: user.email || null,
      };

      const resp = await postRecognize(payload);

      const d = resp.data || resp;

      // bạn có thể đổi điều kiện match theo output raspi
      const matched =
        d?.matched === true ||
        d?.recognized === true ||
        d?.match === true ||
        d?.ok === true ||
        d?.result === "MATCH";

      if (matched) {
        setStatus("✅ Nhận diện thành công — đang mở tủ...", "#00ff66");

        if (typeof window.openLockerSuccess === "function") {
          await window.openLockerSuccess(lockerId);
          return;
        }

        // fallback
        window.location.href = "open.html";
        return;
      }

      setStatus("⏳ Chưa khớp — thử lại...", "#ffd000");
    } catch (err) {
      if (err.status === 401) {
        setStatus("❌ Token thiếu/hết hạn — đăng nhập lại!", "#ff2a2a");
        sessionStorage.removeItem("token");
        sessionStorage.removeItem("user");
        clearInterval(timer);
        return;
      }

      if (err.status === 413) {
        setStatus(
          "❌ Ảnh quá lớn (413) — đang giảm size/quality...",
          "#ff2a2a"
        );
      } else if (err.status === 404) {
        setStatus("❌ Backend thiếu /raspi/recognize-remote (404)", "#ff2a2a");
        clearInterval(timer);
        return;
      } else {
        setStatus(`❌ Recognize error: ${err.message}`, "#ff2a2a");
      }
    } finally {
      busy = false;
    }
  }

  try {
    setStatus("⏳ Đang mở camera...");
    await startCamera();

    // đợi video load size
    const wait = setInterval(() => {
      if (video.videoWidth > 0) {
        clearInterval(wait);
        setStatus("✅ Camera ready. Đang nhận diện...");
        timer = setInterval(poll, 1200);
      }
    }, 200);
  } catch (e) {
    setStatus("❌ Không mở được camera: " + e.message, "#ff2a2a");
  }

  window.addEventListener("beforeunload", () => {
    if (timer) clearInterval(timer);
    const stream = video.srcObject;
    if (stream?.getTracks) stream.getTracks().forEach((t) => t.stop());
  });
});
