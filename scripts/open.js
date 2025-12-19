import { API_BASE } from "../api/api.js";
const RENDER_BRIDGE = API_BASE;

const userRaw = sessionStorage.getItem("user");
const currentUser = userRaw ? JSON.parse(userRaw) : null;

const currentUserId = currentUser ? currentUser._id || currentUser.id : null;

let lockerStates = {};

const USER_UPDATE_ENDPOINTS = ["/auth/update", "/update", "/account/update"];

// --- Helper Functions ---

/**
 * Updates a single field for the current user on the server.
 * @param {string} field - The field name (e.g., 'registeredLocker').
 * @param {string | null} value - The new value.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
async function updateUserField(field, value) {
  if (!currentUserId) return false;

  for (const ep of USER_UPDATE_ENDPOINTS) {
    try {
      const res = await fetch(`${RENDER_BRIDGE}${ep}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: currentUserId,
          [field]: value,
        }),
      });

      if (res.status === 404) continue;

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.user) {
        sessionStorage.setItem("user", JSON.stringify(data.user));
        Object.assign(currentUser, data.user);
        console.log(`✅ Updated user field '${field}' to '${value}' via ${ep}`);
        return true;
      }

      console.error(
        `❌ Update user failed via ${ep}:`,
        data?.error || res.status
      );
      alert(
        `❌ Lỗi cập nhật người dùng: ${data?.error || "Không thể cập nhật"}`
      );
      return false;
    } catch (err) {
      console.warn(`⚠️ Network error updating user via ${ep}:`, err);
    }
  }

  console.warn(
    "⚠️ No user-update endpoint worked. Falling back to session only."
  );
  try {
    const updated = { ...currentUser, [field]: value };
    sessionStorage.setItem("user", JSON.stringify(updated));
    Object.assign(currentUser, updated);
  } catch (_) {}
  return true;
}

/**
 * Sends a command to the Pi (via Bridge) to physically lock the locker.
 * @param {string} lockerId - The ID of the locker to lock (e.g., "01").
 * @returns {Promise<boolean>} - True if command was sent successfully, false otherwise.
 */
async function sendLockCommand(lockerId) {
  if (!currentUserId) return false;
  try {
    console.log(`Sending lock command for locker ${lockerId}`);
    const res = await fetch(`${RENDER_BRIDGE}/raspi/lock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lockerId, user: currentUser?.email }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      console.log(`✅ Lock command acknowledged for ${lockerId}.`);
      return true;
    }
    console.error(
      `❌ Lock command failed for ${lockerId}:`,
      data.error || "Unknown"
    );
    return false;
  } catch (err) {
    console.error(
      `❌ Network error sending lock command for ${lockerId}:`,
      err
    );
    return false;
  }
}

// --- Locker State Management ---

/**
 * Fetches the current status of all lockers from the server.
 */
async function fetchLockerStates() {
  try {
    const res = await fetch(`${RENDER_BRIDGE}/lockers/status`);
    if (!res.ok) throw new Error(`Server responded with status ${res.status}`);
    const data = await res.json();

    if (!data.success || !Array.isArray(data.lockers)) {
      throw new Error(
        data.error || "Invalid data structure received from server"
      );
    }

    lockerStates = data.lockers.reduce((acc, locker) => {
      acc[locker.lockerId] = { status: locker.status, userId: locker.ownerId };
      return acc;
    }, {});

    console.log("✅ Fetched locker states:", lockerStates);

    updateGridUI();
    if (window.updateSliderUI) window.updateSliderUI(lockerStates);
  } catch (err) {
    console.error("❌ Error loading locker states:", err);
    alert("Không thể tải trạng thái tủ khóa: " + err.message);
  }
}

/**
 * Updates the status and owner of a specific locker on the server.
 * @param {string} lockerId
 * @param {'OPEN' | 'LOCKED' | 'EMPTY'} newStatus
 * @param {string | null} newOwnerId
 */
async function updateLockerStatus(lockerId, newStatus, newOwnerId) {
  console.log(
    `Updating locker ${lockerId} => ${newStatus}, owner=${newOwnerId}`
  );
  try {
    const res = await fetch(`${RENDER_BRIDGE}/lockers/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lockerId,
        status: newStatus,
        ownerId: newOwnerId,
      }),
    });

    const data = await res.json();

    if (res.ok && data.success) {
      lockerStates[lockerId] = {
        status: newStatus,
        userId: data.locker.ownerId,
      };

      updateGridUI();
      if (window.updateSliderUI) window.updateSliderUI(lockerStates);
      return true;
    }

    console.error(
      `❌ Failed update locker ${lockerId}:`,
      data.error || res.status
    );
    alert(`❌ Lỗi: ${data.error || "Không thể cập nhật trạng thái tủ."}`);
    return false;
  } catch (err) {
    console.error(`❌ Network error updating locker ${lockerId}:`, err);
    alert(`❌ Lỗi kết nối khi cập nhật tủ ${lockerId}.`);
    return false;
  }
}

// --- UI Update Function ---

function updateGridUI() {
  const gridContainer = document.querySelector(".grid-container");

  // ✅ FIX: deploy có thể không còn open.html trong pathname
  const path = window.location.pathname.toLowerCase();
  const isOpenPage = path.includes("open");

  if (!isOpenPage || !gridContainer) return;

  const gridItems = gridContainer.querySelectorAll(".grid-item");
  if (!gridItems.length) return;

  gridItems.forEach((item) => {
    const lockerId = item.dataset.lockerId;
    const state = lockerStates[lockerId] || { status: "EMPTY", userId: null };

    item.classList.remove("status-empty", "status-locked", "status-open");
    item.style.border = "";
    item.style.backgroundColor = "transparent";
    item.style.opacity = "1";
    item.onmouseenter = null;
    item.onmouseleave = null;
    item
      .querySelectorAll(".close-btn, .unregister-btn")
      .forEach((btn) => btn.remove());

    if (state.status === "EMPTY") {
      item.classList.add("status-empty");
    } else if (state.status === "LOCKED") {
      item.classList.add("status-locked");
      item.style.border = "2px solid red";
      item.style.backgroundColor = "rgba(255, 0, 0, 0.3)";

      if (state.userId === currentUserId) {
        addGridButton(item, "HỦY ĐĂNG KÝ", "#ff6600", () =>
          handleUnregister(lockerId)
        );
      } else {
        item.style.opacity = "0.7";
      }
    } else if (state.status === "OPEN") {
      if (state.userId === currentUserId) {
        item.classList.add("status-open");
        item.style.border = "2px solid lime";
        item.style.backgroundColor = "rgba(0, 255, 0, 0.2)";
        addGridButton(item, "CLOSE", "yellow", () =>
          handleCloseLocker(lockerId)
        );
      } else {
        item.classList.add("status-locked");
        item.style.border = "2px solid orange";
        item.style.backgroundColor = "rgba(255, 165, 0, 0.3)";
        item.style.opacity = "0.7";
      }
    }
  });
}

function addGridButton(gridItem, text, color, onClickHandler) {
  const button = document.createElement("button");
  button.textContent = text;
  button.className = text === "CLOSE" ? "close-btn" : "unregister-btn";
  button.style.position = "absolute";
  button.style.bottom = "10px";
  button.style.left = "50%";
  button.style.transform = "translateX(-50%)";
  button.style.zIndex = "10";
  button.style.padding = "5px 10px";
  button.style.backgroundColor = color;
  button.style.color = color === "yellow" ? "black" : "white";
  button.style.border = "none";
  button.style.borderRadius = "5px";
  button.style.cursor = "pointer";
  button.style.visibility = "hidden";
  button.style.opacity = "0";
  button.style.transition = "opacity 0.2s ease";

  button.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClickHandler();
  };

  gridItem.appendChild(button);

  gridItem.onmouseenter = () => {
    button.style.visibility = "visible";
    button.style.opacity = "1";
  };
  gridItem.onmouseleave = () => {
    button.style.visibility = "hidden";
    button.style.opacity = "0";
  };
}

// --- Event Handlers ---

function handleLockerClick(lockerId) {
  if (!currentUserId) {
    alert("Bạn cần đăng nhập để tương tác với tủ khóa.");
    window.location.href = "./logon.html";
    return;
  }

  const state = lockerStates[lockerId] || { status: "EMPTY", userId: null };

  if (state.status === "EMPTY") {
    const userLocker = currentUser?.registeredLocker;
    const hasRegisteredLocker =
      typeof userLocker === "string" && /^\d{2}$/.test(userLocker);

    if (hasRegisteredLocker) {
      alert(
        `Bạn đã đăng ký tủ ${userLocker}. Vui lòng hủy đăng ký tủ đó trước khi đăng ký tủ mới.`
      );
      return;
    }

    if (confirm(`Tủ ${lockerId} đang trống. Bạn muốn đăng ký và mở tủ này?`)) {
      sessionStorage.setItem("locker_to_open", lockerId);
      window.location.href = "./face_log.html";
    }
    return;
  }

  if (state.userId === currentUserId) {
    if (state.status === "LOCKED") {
      if (confirm(`Đây là tủ của bạn (Tủ ${lockerId}). Bạn muốn mở khóa?`)) {
        sessionStorage.setItem("locker_to_open", lockerId);
        window.location.href = "./face_log.html";
      }
    } else {
      alert(`Tủ ${lockerId} của bạn hiện đang mở.`);
    }
    return;
  }

  alert(
    `Tủ ${lockerId} đang ${
      state.status === "OPEN" ? "được sử dụng" : "đã được đăng ký"
    } bởi người khác.`
  );
}
window.handleLockerClick = handleLockerClick;

async function handleCloseLocker(lockerId) {
  if (confirm(`Bạn có chắc muốn đóng và khóa tủ ${lockerId}?`)) {
    const lockSent = await sendLockCommand(lockerId);
    await updateLockerStatus(lockerId, "LOCKED", currentUserId);
    alert(
      lockSent
        ? `Đã gửi lệnh khóa tủ ${lockerId}.`
        : `Đã cập nhật DB LOCKED nhưng lỗi gửi lệnh khóa vật lý.`
    );
  }
}
window.handleCloseLocker = handleCloseLocker;

async function handleUnregister(lockerId) {
  if (
    confirm(
      `Bạn có chắc muốn hủy đăng ký tủ ${lockerId}? Tủ sẽ được khóa lại và trở thành trống.`
    )
  ) {
    await sendLockCommand(lockerId);

    const ok = await updateLockerStatus(lockerId, "EMPTY", null);
    if (ok) {
      await updateUserField("registeredLocker", null);
      alert(`Đã hủy đăng ký tủ ${lockerId}.`);
    } else {
      alert(`Có lỗi khi cập nhật trạng thái tủ ${lockerId} thành trống.`);
    }
  }
}
window.handleUnregister = handleUnregister;

window.openLockerSuccess = (lockerId) => {
  if (!lockerId) return alert("Lỗi: Không có ID tủ khóa để mở.");
  if (!currentUserId) return alert("Lỗi: Không tìm thấy thông tin người dùng.");

  fetch(`${RENDER_BRIDGE}/raspi/unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lockerId, user: currentUser?.email }),
  })
    .then((res) => res.json())
    .then((unlockData) => {
      if (!unlockData.success && unlockData.error) {
        alert(
          "⚠️ Lệnh mở khóa vật lý thất bại: " +
            unlockData.error +
            ". DB vẫn sẽ cập nhật."
        );
      }
      return updateLockerStatus(lockerId, "OPEN", currentUserId);
    })
    .then(async (dbOk) => {
      if (!dbOk) {
        alert(`❌ Không thể cập nhật trạng thái tủ ${lockerId} trong DB.`);
        return;
      }

      const userLocker = currentUser?.registeredLocker;
      const needsUserUpdate =
        typeof userLocker !== "string" || !/^\d{2}$/.test(userLocker);
      if (needsUserUpdate) await updateUserField("registeredLocker", lockerId);

      alert(`🔓 Tủ ${lockerId} đã mở thành công! (Relay đang BẬT)`);
      window.location.href = "./index.html";
    })
    .catch((err) => alert("❌ Lỗi mở khóa: " + err.message));
};

// --- Initialization ---

document.addEventListener("DOMContentLoaded", () => {
  const path = window.location.pathname.toLowerCase();
  const isIndex =
    path.endsWith("index.html") || path === "/" || path.endsWith("/");
  const isOpenPage = path.includes("open");

  if (isIndex || isOpenPage) {
    if (isOpenPage) {
      const gridContainer = document.querySelector(".grid-container");
      if (gridContainer) {
        gridContainer.addEventListener("click", (e) => {
          const item = e.target.closest(".grid-item");
          if (item && !e.target.closest("button")) {
            e.preventDefault();
            handleLockerClick(item.dataset.lockerId);
          }
        });
      }
    }
    fetchLockerStates();
  }
});
