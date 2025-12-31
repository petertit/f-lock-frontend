document.addEventListener("DOMContentLoaded", () => {
  const statusEl = document.querySelector("#status");

  const raspiImg = document.getElementById("raspiCamera");
  const video = document.getElementById("userCamera");

  const btnStart = document.getElementById("btnStartCam");
  const btnSwitch = document.getElementById("btnSwitchCam");
  const controls = document.getElementById("cameraControls");

  // ✅ Backend bridge (đúng route bạn đang có: /raspi/recognize)
  const BRIDGE_RASPI = "https://f-locker-backend.onrender.com/raspi";

  // (Tuỳ chọn) Stream nội bộ khi chạy local cùng Raspi
  const RASPI_STREAM = "http://127.0.0.1:5000/video_feed";

  // ====== USER + TOKEN ======
  const userRaw = sessionStorage.getItem("user");
  const currentUser = userRaw ? JSON.parse(userRaw) : null;

  const token =
    sessionStorage.getItem("token") ||
    sessionStorage.getItem("jwt") ||
    currentUser?.token ||
    null;

  const currentUserId = currentUser
    ? String(currentUser._id || currentUser.id || "")
    : null;

  if (!currentUser) {
    alert("Chưa đăng nhập. Quay lại login.");
    window.location.href = "logon.html";
    return;
  }

  // locker được chọn từ open.html / index slider
  const lockerId = sessionStorage.getItem("locker_to_open");
  if (!lockerId) {
    alert("Không tìm thấy tủ cần mở. Quay lại Open Locker.");
    window.location.href = "open.html";
    return;
  }

  let mediaStream = null;
  let usingFront = true;
  let isRasPiMode = false;
  let pollTimer = null;
  let stopped = false;

  function setStatus(text, color = "#ccc") {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.style.color = color;
  }

  function stopLoop() {
    stopped = true;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
  }

  // =========================
  // MODE DETECTION
  // =========================
  const isPhone = /iPhone|Android/i.test(navigator.userAgent);
  const isSecure = window.isSecureContext;

  if (!isSecure && !location.hostname.includes("localhost")) {
    setStatus("⚠️ Camera cần HTTPS", "#ffaa00");
  }

  // =========================
  // RASPBERRY PI MODE (local)
  // =========================
  function startRaspiCamera() {
    isRasPiMode = true;

    if (raspiImg) {
      raspiImg.src = RASPI_STREAM;
      raspiImg.style.display = "block";
    }
    if (video) video.style.display = "none";
    if (controls) controls.style.display = "none";

    setStatus("🎥 Raspberry Pi Camera — Đang nhận diện...", "#00ffff");
    pollRecognition();
  }

  // =========================
  // PHONE / LAPTOP CAMERA (UI only)
  // ⚠️ Không gửi ảnh base64 nữa để tránh 413
  // =========================
  async function startUserCamera() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("❌ Thiết bị không hỗ trợ camera", "#ff3330");
        return;
      }

      if (mediaStream) {
        mediaStream.getTracks().forEach((t) => t.stop());
      }

      const constraints = {
        video: {
          facingMode: usingFront ? "user" : { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      if (video) {
        video.srcObject = mediaStream;
        await video.play();
        video.style.display = "block";
      }

      if (raspiImg) raspiImg.style.display = "none";
      if (controls) controls.style.display = isPhone ? "flex" : "none";

      // ✅ Dù dùng camera điện thoại, vẫn gọi nhận diện qua Raspi (backend -> raspi capture)
      setStatus("📱 Camera OK — Nhận diện qua Raspberry Pi...", "#00ffff");
      pollRecognition();
    } catch (err) {
      console.error(err);
      setStatus("❌ Không mở được camera", "#ff3330");
      alert("Không mở được camera. Hãy cấp quyền Camera.");
    }
  }

  btnStart?.addEventListener("click", startUserCamera);
  btnSwitch?.addEventListener("click", async () => {
    usingFront = !usingFront;
    await startUserCamera();
  });

  // =========================
  // CALL BACKEND: POST /raspi/recognize
  // =========================
  async function callRecognize() {
    const endpoint = `${BRIDGE_RASPI}/recognize`;

    const headers = new Headers({ "Content-Type": "application/json" });
    if (token) headers.set("Authorization", `Bearer ${token}`);

    // ✅ payload nhỏ, không gửi ảnh
    const payload = {
      lockerId, // để server/raspi biết đang mở tủ nào (nếu bạn cần)
      userId: currentUserId,
      email: currentUser.email || null,
      name: currentUser.name || null,
      mode: isRasPiMode ? "raspi" : "webcam",
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    // nếu server trả HTML/404 => đọc text để debug
    const ct = res.headers.get("content-type") || "";
    const raw = ct.includes("application/json")
      ? await res.json().catch(() => null)
      : await res.text().catch(() => "");

    if (!res.ok) {
      const msg =
        typeof raw === "string"
          ? raw.slice(0, 120)
          : raw?.error || raw?.message || `HTTP ${res.status}`;
      throw new Error(msg || `HTTP ${res.status}`);
    }

    return raw || {};
  }

  // =========================
  // RECOGNITION LOOP
  // =========================
  async function pollRecognition() {
    if (stopped) return;
    if (pollTimer) clearTimeout(pollTimer);

    // token bắt buộc nếu backend bạn bảo vệ /raspi/*
    if (!token) {
      setStatus("❌ Missing token — vui lòng đăng nhập lại", "#ff3333");
      alert("Missing token. Vui lòng đăng nhập lại.");
      window.location.href = "logon.html";
      return;
    }

    setStatus("🔄 Đang nhận diện...", "#ffaa00");

    try {
      const data = await callRecognize();
      handleResult(data);
    } catch (err) {
      console.error("Recognize error:", err.message);
      setStatus("⚠️ Nhận diện lỗi — thử lại...", "#ffaa00");
      pollTimer = setTimeout(pollRecognition, 2500);
    }
  }

  function normalize(s) {
    return String(s || "")
      .trim()
      .toLowerCase();
  }

  function handleResult(data) {
    /**
     * Bạn có thể trả về nhiều kiểu:
     * - { success:true, name:"...", userId:"..." }
     * - { success:true, match:true, user:{_id/email/name} }
     * - { ok:true, ... }
     */
    const success = !!(data?.success ?? data?.ok ?? data?.match);
    if (!success) {
      pollTimer = setTimeout(pollRecognition, 2000);
      return;
    }

    const matched =
      normalize(data?.email) === normalize(currentUser.email) ||
      String(data?.userId || data?.sub || "") === String(currentUserId || "") ||
      normalize(data?.name) === normalize(currentUser.name) ||
      normalize(data?.user?.email) === normalize(currentUser.email) ||
      String(data?.user?._id || data?.user?.id || "") ===
        String(currentUserId || "") ||
      normalize(data?.user?.name) === normalize(currentUser.name);

    if (!matched) {
      pollTimer = setTimeout(pollRecognition, 1500);
      return;
    }

    // ✅ MATCHED
    stopLoop();
    setStatus(`✅ Nhận diện OK — Welcome ${currentUser.name}`, "#00ff66");

    if (typeof window.openLockerSuccess === "function") {
      window.openLockerSuccess(lockerId);
    } else {
      alert("Nhận diện OK nhưng thiếu hàm openLockerSuccess.");
    }
  }

  // =========================
  // INIT
  // =========================
  // Nếu chạy local cùng Raspi thì dùng stream raspi
  if (
    location.hostname.includes("127.0.0.1") ||
    location.hostname === "localhost"
  ) {
    startRaspiCamera();
  } else {
    // Cloud / phone / laptop
    if (controls) controls.style.display = isPhone ? "flex" : "none";
    if (!isPhone) startUserCamera();
    else setStatus("📱 Nhấn 'Bật camera' để bắt đầu", "#ffaa00");
  }
});
