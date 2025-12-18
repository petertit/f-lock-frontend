// backend/face_id.js - Dual Mode: Laptop (WebRTC) <-> RasPi (MJPEG)
// TÍNH NĂNG MỚI: Chụp 5 ảnh/lần bấm nút và giới hạn 5 lần chụp thành công.

document.addEventListener("DOMContentLoaded", () => {
  const takeBtn = document.querySelector(".take-btn");
  const cameraWrapper = document.querySelector(".face-scan-wrapper");
  const statusEl = document.querySelector("#status");
  const BRIDGE_SERVER = "https://smart-locker-kgnx.onrender.com/raspi";
  const RASPI_NGROK = "https://adelaida-gymnogynous-gnostically.ngrok-free.dev"; // ✅ Đã thêm lại Ngrok URL
  const LOCAL_IP_CHECK = ["localhost", "127.0.0.1", "192.168."];
  const MAX_SUCCESS_CAPTURES = 5;

  let mediaStream = null;
  let isRasPiMode = false;
  let captureCount = 0; // Biến đếm số lần chụp thành công

  // Cập nhật trạng thái nút và hiển thị số lần chụp
  function updateCaptureStatus() {
    takeBtn.textContent = `📸 Chụp (${captureCount}/${MAX_SUCCESS_CAPTURES})`;
    if (captureCount >= MAX_SUCCESS_CAPTURES) {
      takeBtn.disabled = true;
      takeBtn.textContent = "✅ Hoàn thành 5 lần chụp (Đã Train)";
      statusEl.textContent =
        "✅ Đã đủ 5 lần chụp thành công. Khuôn mặt đã được train.";
      statusEl.style.color = "#00ff66";
    } else {
      takeBtn.disabled = false;
    }
  }

  // Khởi tạo: Đọc số lần chụp đã lưu (sử dụng localStorage để giữ trạng thái)
  function initialize() {
    const user = JSON.parse(sessionStorage.getItem("user"));
    const username = user?.name || user?.username || "unknown";
    const storageKey = `capture_count_${username}`;

    captureCount = parseInt(localStorage.getItem(storageKey) || "0", 10);

    // Xóa phần tử #cameraPreview cũ nếu có (từ HTML gốc)
    const oldImg = document.querySelector("img#cameraPreview");
    if (oldImg) oldImg.remove();

    setupCameraInterface();
    updateCaptureStatus();
  }

  // 1. Thiết lập giao diện và chế độ Camera
  function setupCameraInterface() {
    const currentUrl = window.location.href;
    // Thêm kiểm tra RASPI_NGROK vào isLocal để phân biệt RasPi chạy qua Ngrok
    const isLocal =
      LOCAL_IP_CHECK.some((ip) => currentUrl.includes(ip)) ||
      currentUrl.includes(RASPI_NGROK);

    if (isLocal) {
      isRasPiMode = true;
      console.log("Mode: Raspberry Pi Camera (Local/Ngrok)");

      const img = document.createElement("img");
      img.id = "cameraPreview";
      // Sử dụng 127.0.0.1:5000 cho RasPi (vì request đến Render Bridge sẽ xử lý)
      img.src = `${currentUrl.split(":")[0]}://127.0.0.1:5000/video_feed`;
      img.alt = "Raspberry Pi Camera Preview";
      img.style.maxWidth = "90%";
      img.style.borderRadius = "10px";
      img.style.border = "2px solid #1a73e8";
      cameraWrapper.insertBefore(img, takeBtn);
      if (captureCount < MAX_SUCCESS_CAPTURES) {
        statusEl.textContent = "🎥 Live stream from Raspberry Pi";
        statusEl.style.color = "#00ffff";
      }
    } else {
      isRasPiMode = false;
      console.log("Mode: Laptop Camera (Remote)");

      const video = document.createElement("video");
      video.id = "laptopCamera";
      video.autoplay = true;
      video.style.maxWidth = "90%";
      video.style.borderRadius = "10px";
      video.style.border = "2px solid #1a73e8";
      cameraWrapper.insertBefore(video, takeBtn);
      if (captureCount < MAX_SUCCESS_CAPTURES) {
        startLaptopCamera(video);
      }
    }
  }

  // 2. Kích hoạt camera Laptop (WebRTC)
  async function startLaptopCamera(videoEl) {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoEl.srcObject = mediaStream;
      statusEl.textContent = "🎥 Live stream from Laptop Camera";
      statusEl.style.color = "#00ffff";
    } catch (err) {
      console.error("Lỗi truy cập camera:", err);
      statusEl.textContent =
        "❌ Cannot access Laptop Camera. Check permissions.";
      statusEl.style.color = "#ff3333";
    }
  }

  // 3. Xử lý logic chụp ảnh
  takeBtn.addEventListener("click", async () => {
    if (captureCount >= MAX_SUCCESS_CAPTURES) return;

    takeBtn.disabled = true; // Vô hiệu hóa nút trong khi xử lý

    const user = JSON.parse(sessionStorage.getItem("user"));
    const rawUsername = user?.name || user?.username || "unknown";
    const username = rawUsername.replace(/\s/g, "_").toLowerCase();
    const storageKey = `capture_count_${username}`;

    statusEl.textContent =
      "📸 Đang chụp 5 tấm ảnh và train... Vui lòng giữ yên.";
    statusEl.style.color = "#ffaa00";

    let payload = { name: username };
    let endpoint;

    if (!isRasPiMode) {
      // CHẾ ĐỘ LAPTOP: Chụp 5 ảnh Base64
      if (!mediaStream) {
        statusEl.textContent = "❌ Camera Laptop chưa sẵn sàng.";
        takeBtn.disabled = false;
        return;
      }

      const videoEl = document.querySelector("#laptopCamera");
      const images = [];

      for (let i = 0; i < 5; i++) {
        // Chụp 5 tấm ảnh liên tiếp
        const canvas = document.createElement("canvas");
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;
        canvas
          .getContext("2d")
          .drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        // Gửi dữ liệu ảnh Base64
        images.push(canvas.toDataURL("image/jpeg", 0.9).split(",")[1]);
        await new Promise((r) => setTimeout(r, 200)); // Đợi 200ms giữa các tấm
      }

      payload.images_data = images; // Gửi mảng ảnh
      endpoint = `${BRIDGE_SERVER}/capture-remote-batch`;
    } else {
      // CHẾ ĐỘ RASPI: Chỉ gửi lệnh RasPi tự chụp 5 tấm
      endpoint = `${BRIDGE_SERVER}/capture-batch`;
    }

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        captureCount += 1; // Tăng số lần chụp thành công
        localStorage.setItem(storageKey, captureCount.toString());
        statusEl.textContent = `✅ Lần chụp #${captureCount} thành công! Đã lưu 5 ảnh và Train.`;
        statusEl.style.color = "#00ff66";
      } else {
        statusEl.textContent = "❌ " + (data.error || "Failed to capture");
        statusEl.style.color = "#ff3333";
      }
    } catch (err) {
      console.error("Fetch error:", err);
      statusEl.textContent =
        "❌ Cannot contact Raspberry Pi Bridge! Kiểm tra Ngrok và Render.";
      statusEl.style.color = "#ff3333";
    } finally {
      updateCaptureStatus(); // Cập nhật trạng thái sau khi hoàn tất
    }
  });

  initialize();
});
