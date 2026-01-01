document.addEventListener("DOMContentLoaded", () => {
  // ===== CONFIG =====
  const API_BASE = "https://f-locker-backend.onrender.com"; // đổi nếu backend khác
  const ENDPOINTS = ["/raspi/recognize-remote", "/raspi/recognize"]; // thử lần lượt, cái nào tồn tại sẽ chạy

  // ===== ELEMENTS =====
  const userCamera = document.getElementById("userCamera"); // <video>
  const raspiCamera = document.getElementById("raspiCamera"); // <img> (optional)
  const statusEl = document.querySelector("#status");

  // ===== SESSION =====
  const userRaw = sessionStorage.getItem("user");
  const token = sessionStorage.getItem("token");
  const lockerId = sessionStorage.getItem("locker_to_open"); // nếu bạn dùng flow này

  if (!userRaw) {
    alert("⚠️ Bạn cần đăng nhập trước!");
    window.location.href = "logon.html";
    return;
  }

  // ===== STATE =====
  let stream = null;
  let facingMode = "user"; // 'user' | 'environment'
  let useRaspiCam = false; // ✅ FIX: mặc định dùng local cam để hiện video

  // ===== UI HELPERS =====
  function setStatus(text, color = "#4cff8a") {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.style.color = color;
  }

  function showLocalCameraMode() {
    useRaspiCam = false;
    if (raspiCamera) raspiCamera.style.display = "none";
    if (userCamera) userCamera.style.display = "block";
  }

  function showRaspiCameraMode() {
    useRaspiCam = true;
    if (userCamera) userCamera.style.display = "none";
    if (raspiCamera) raspiCamera.style.display = "block";
  }

  // ===== CAMERA =====
  async function startLocalCamera() {
    try {
      setStatus("⏳ Đang mở camera...", "#4cff8a");

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Trình duyệt không hỗ trợ camera (getUserMedia).");
      }

      // stop old
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }

      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      userCamera.srcObject = stream;
      userCamera.muted = true;
      userCamera.playsInline = true;
      await userCamera.play();

      showLocalCameraMode(); // ✅ quan trọng: hiện video

      setStatus("✅ Camera ready. Đang nhận diện...", "#4cff8a");
    } catch (err) {
      console.error(err);
      setStatus("❌ Không mở được camera: " + err.message, "#ff4b4b");
    }
  }

  // ===== IMAGE CAPTURE (nén để tránh 413) =====
  async function captureFrameBlob() {
    if (!userCamera) throw new Error("Missing #userCamera");
    if (!stream) throw new Error("Camera chưa sẵn sàng");

    const w = userCamera.videoWidth || 640;
    const h = userCamera.videoHeight || 480;

    // ✅ nén kích thước xuống ~320px chiều ngang
    const targetW = 320;
    const scale = targetW / w;
    const cw = Math.max(160, Math.round(w * scale));
    const ch = Math.max(120, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(userCamera, 0, 0, cw, ch);

    // JPEG quality 0.6 (giảm size mạnh)
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.6)
    );

    if (!blob) throw new Error("Capture failed");
    return blob;
  }

  // ===== API FETCH =====
  async function apiPost(path, body, isForm = false) {
    const headers = {};
    if (!isForm) headers["Content-Type"] = "application/json";
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(API_BASE + path, {
      method: "POST",
      headers,
      body,
    });

    // nếu trả HTML -> sẽ lỗi JSON, nên đọc text trước
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      data = { raw: text };
    }

    return { res, data };
  }

  async function recognizeOnce() {
    // Nếu bạn có raspi stream/snapshot thì mới bật mode raspi.
    // Hiện tại bạn nói backend đã post được -> dùng local cam là ổn.
    if (useRaspiCam) {
      // nếu muốn bạn có thể implement fetch snapshot
      showLocalCameraMode();
    }

    const imgBlob = await captureFrameBlob();

    // ưu tiên FormData
    const fd = new FormData();
    fd.append("image", imgBlob, "frame.jpg");
    if (lockerId) fd.append("lockerId", lockerId);

    // thử endpoint theo thứ tự
    for (const ep of ENDPOINTS) {
      const { res, data } = await apiPost(ep, fd, true);

      if (res.status === 404) continue; // thử endpoint khác

      if (!res.ok) {
        const msg = data?.error || data?.message || `HTTP ${res.status}`;
        throw new Error(msg);
      }

      // ✅ bạn tùy backend trả gì: matched / success / userId ...
      return data;
    }

    throw new Error("Not Found (endpoint recognize không tồn tại)");
  }

  // ===== LOOP =====
  let running = true;

  async function loopRecognize() {
    while (running) {
      try {
        const data = await recognizeOnce();

        // ví dụ backend trả { success:true, matched:true }
        if (data?.matched || data?.success === true) {
          setStatus("✅ Nhận diện thành công!", "#00ff66");

          // nếu bạn muốn mở tủ sau khi nhận diện:
          // window.openLockerSuccess?.(lockerId);

          // dừng loop
          break;
        } else {
          setStatus("⚠️ Chưa khớp — thử lại...", "#ffd000");
        }
      } catch (err) {
        console.error("Recognize error:", err.message);
        setStatus("⚠️ Nhận diện lỗi — thử lại...", "#ff8800");
      }

      // delay giữa các lần nhận diện
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  // ===== INIT =====
  startLocalCamera().then(() => {
    // ✅ camera đã hiện thì mới bắt đầu nhận diện
    loopRecognize();
  });

  // ===== CLEANUP =====
  window.addEventListener("beforeunload", () => {
    running = false;
    try {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    } catch (_) {}
  });
});
