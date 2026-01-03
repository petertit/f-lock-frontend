takeBtn.addEventListener("click", async () => {
  if (done) return;

  try {
    setButton("⏳ Đang chụp & train...", true);
    setStatus("📸 Đang chụp 5 ảnh (oval) và train... Giữ yên nhé.", "#ffaa00");

    const user2 = getUser();
    const username2 = normalizeName(user2?.name || user2?.username);

    const lockerId =
      sessionStorage.getItem("locker_to_open") ||
      sessionStorage.getItem("selectedLocker") ||
      sessionStorage.getItem("lockerId") ||
      null;

    if (!isRasPiMode) {
      if (!mediaStream) throw new Error("Laptop camera is not ready.");

      const videoEl = document.querySelector("#laptopCamera");
      if (!videoEl) throw new Error("Missing #laptopCamera element.");

      const images = await captureFramesFromVideo(videoEl, MAX_CAPTURES, 200);

      const endpoint = `${BRIDGE_SERVER}/capture-remote-batch`;
      const body = {
        name: username2,
        images_data: images,
        ...(lockerId ? { lockerId } : {}),
      };

      const data = await postJson(endpoint, body);

      // ✅ only set done when success
      if (data?.success === false)
        throw new Error(data?.error || "Train failed");

      done = true;
      localStorage.setItem(`face_done_${username2}`, "1");

      const info = data?.saved_files?.length
        ? ` (saved ${data.saved_files.length} files)`
        : "";

      setStatus(
        "✅ Train thành công! Khuôn mặt đã được lưu." + info,
        "#00ff66"
      );
      setButton("✅ Hoàn thành (Đã Train)", true);
      return;
    }

    // raspi cam mode
    const endpoint = `${BRIDGE_SERVER}/capture-batch`;
    const body = { name: username2, ...(lockerId ? { lockerId } : {}) };
    const data = await postJson(endpoint, body);

    if (data?.success === false) throw new Error(data?.error || "Train failed");

    done = true;
    localStorage.setItem(`face_done_${username2}`, "1");
    setStatus("✅ Train thành công! Khuôn mặt đã được lưu.", "#00ff66");
    setButton("✅ Hoàn thành (Đã Train)", true);
  } catch (err) {
    console.error("Capture/train error:", err);
    setStatus("❌ " + (err?.message || "Capture failed"), "#ff3333");
    setButton(`📸 Chụp (0/${MAX_CAPTURES})`, false);
  }
});
