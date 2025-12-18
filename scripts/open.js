const RENDER_BRIDGE = "https://f-locker-backend.onrender.com";
const LOCKER_COUNT = 9;

const userRaw = sessionStorage.getItem("user");
const currentUser = userRaw ? JSON.parse(userRaw) : null;
const currentUserId = currentUser ? currentUser.id : null;

let lockerStates = {};

// --- Helper Functions ---

/**
 * Updates a single field for the current user on the server.
 * @param {string} field - The field name (e.g., 'registeredLocker').
 * @param {string | null} value - The new value.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
async function updateUserField(field, value) {
  if (!currentUserId) return false;
  try {
    const res = await fetch(`${RENDER_BRIDGE}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: currentUserId, // Send string ID
        [field]: value,
      }),
    });
    const data = await res.json();
    if (res.ok && data.user) {
      sessionStorage.setItem("user", JSON.stringify(data.user)); // Update session
      Object.assign(currentUser, data.user); // Update global variable
      console.log(`User field '${field}' updated to '${value}'`);
      return true;
    } else {
      console.error(
        `Error updating user field '${field}':`,
        data.error || "Unknown server error"
      );
      alert(
        `❌ Lỗi cập nhật thông tin người dùng: ${
          data.error || "Lỗi không xác định"
        }`
      );
      return false;
    }
  } catch (err) {
    console.error(`Network error updating user field '${field}':`, err);
    alert(`❌ Lỗi mạng khi cập nhật thông tin người dùng: ${err.message}`);
    return false;
  }
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
      body: JSON.stringify({ lockerId: lockerId, user: currentUser?.email }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      console.log(`Lock command acknowledged for ${lockerId}.`);
      return true;
    } else {
      console.error(
        `Lock command failed for ${lockerId}:`,
        data.error || "Unknown Pi error"
      );
      // Avoid alerting multiple times during logout
      // alert(`⚠️ Không thể gửi lệnh khóa đến tủ ${lockerId}: ${data.error || 'Lỗi không xác định'}`);
      return false;
    }
  } catch (err) {
    console.error(`Network error sending lock command for ${lockerId}:`, err);
    // alert(`❌ Lỗi mạng khi gửi lệnh khóa cho tủ ${lockerId}.`);
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
    console.log("Fetched locker states:", lockerStates);

    updateGridUI();
    if (window.updateSliderUI) {
      window.updateSliderUI(lockerStates);
    }
  } catch (err) {
    console.error("Error loading locker states:", err);
    alert("Không thể tải trạng thái tủ khóa: " + err.message);
  }
}

/**
 * Updates the status and owner of a specific locker on the server.
 * @param {string} lockerId - The ID of the locker.
 * @param {'OPEN' | 'LOCKED' | 'EMPTY'} newStatus - The new status.
 * @param {string | null} newOwnerId - The string ID of the new owner, or null.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
async function updateLockerStatus(lockerId, newStatus, newOwnerId) {
  console.log(
    `Updating locker ${lockerId} to status: ${newStatus}, owner: ${newOwnerId}`
  );
  const payload = { lockerId, status: newStatus, ownerId: newOwnerId };
  try {
    const res = await fetch(`${RENDER_BRIDGE}/lockers/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      console.log(`Locker ${lockerId} updated successfully on server.`);

      lockerStates[lockerId] = {
        status: newStatus,
        userId: data.locker.ownerId,
      };
      updateGridUI();
      if (window.updateSliderUI) {
        window.updateSliderUI(lockerStates);
      }
      return true;
    } else {
      console.error(
        `Failed to update locker ${lockerId} status:`,
        data.error || `Server status ${res.status}`
      );
      alert(`❌ Lỗi: ${data.error || "Không thể cập nhật trạng thái tủ."}`);
      return false;
    }
  } catch (err) {
    console.error(`Network error updating locker ${lockerId} status:`, err);
    alert(`❌ Lỗi kết nối khi cập nhật tủ ${lockerId}.`);
    return false;
  }
}

// --- UI Update Function ---

function updateGridUI() {
  const gridContainer = document.querySelector(".grid-container");
  if (!window.location.pathname.endsWith("open.html") || !gridContainer) {
    return;
  }

  const gridItems = gridContainer.querySelectorAll(".grid-item");
  if (!gridItems.length) return;

  console.log("Updating grid UI on open.html...");

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
  console.log(`Handling click for locker ${lockerId}`);
  if (!currentUserId) {
    alert("Bạn cần đăng nhập để tương tác với tủ khóa.");
    window.location.href = "./logon.html";
    return;
  }

  const state = lockerStates[lockerId] || { status: "EMPTY", userId: null };

  if (state.status === "EMPTY") {
    console.log(`Locker ${lockerId} is EMPTY.`);

    const userLocker = currentUser.registeredLocker;
    let hasRegisteredLocker = false;
    if (typeof userLocker === "string" && /^\d{2}$/.test(userLocker)) {
      hasRegisteredLocker = true;
    }

    if (hasRegisteredLocker) {
      alert(
        `Bạn đã đăng ký tủ ${userLocker}. Vui lòng hủy đăng ký tủ đó trước khi đăng ký tủ mới.`
      );
      return;
    }

    if (confirm(`Tủ ${lockerId} đang trống. Bạn muốn đăng ký và mở tủ này?`)) {
      console.log(
        `User confirmed registration for ${lockerId}. Redirecting to auth method selection...`
      );
      sessionStorage.setItem("locker_to_open", lockerId);
      window.location.href = "./face_log.html";
    }
  } else if (state.userId === currentUserId) {
    console.log(
      `Locker ${lockerId} belongs to current user. Status: ${state.status}`
    );
    if (state.status === "LOCKED") {
      if (confirm(`Đây là tủ của bạn (Tủ ${lockerId}). Bạn muốn mở khóa?`)) {
        console.log(
          `User confirmed unlock for ${lockerId}. Redirecting to auth method selection...`
        );
        sessionStorage.setItem("locker_to_open", lockerId);
        window.location.href = "./face_log.html";
      }
    } else {
      alert(`Tủ ${lockerId} của bạn hiện đang mở.`);
    }
  } else {
    console.log(`Locker ${lockerId} is occupied by another user.`);
    alert(
      `Tủ ${lockerId} đang ${
        state.status === "OPEN" ? "được sử dụng" : "đã được đăng ký"
      } bởi người khác.`
    );
  }
}
window.handleLockerClick = handleLockerClick;
async function handleCloseLocker(lockerId) {
  console.log(`Handling CLOSE button for locker ${lockerId}`);
  if (confirm(`Bạn có chắc muốn đóng và khóa tủ ${lockerId}?`)) {
    const lockSent = await sendLockCommand(lockerId);
    await updateLockerStatus(lockerId, "LOCKED", currentUserId);
    if (lockSent) {
      alert(`Đã gửi lệnh khóa tủ ${lockerId}.`);
    } else {
      alert(
        `Đã cập nhật trạng thái tủ ${lockerId} thành ĐÃ KHÓA, nhưng có lỗi khi gửi lệnh khóa vật lý.`
      );
    }
  }
}
window.handleCloseLocker = handleCloseLocker;

async function handleUnregister(lockerId) {
  console.log(`Handling UNREGISTER button for locker ${lockerId}`);
  if (
    confirm(
      `Bạn có chắc muốn hủy đăng ký tủ ${lockerId}? Tủ sẽ được khóa lại và trở thành trống.`
    )
  ) {
    await sendLockCommand(lockerId);

    const lockerUpdated = await updateLockerStatus(lockerId, "EMPTY", null);

    if (lockerUpdated) {
      await updateUserField("registeredLocker", null);
      alert(`Đã hủy đăng ký tủ ${lockerId}.`);
    } else {
      alert(
        `Có lỗi xảy ra khi cập nhật trạng thái tủ ${lockerId} thành trống.`
      );
    }
  }
}
window.handleUnregister = handleUnregister;

window.handleLogoutAndLock = function () {
  console.log("Handling logout and lock...");
  if (!currentUserId) {
    sessionStorage.removeItem("user");
    window.location.href = "logon.html";
    return;
  }

  const lockPromises = [];
  const updateDbPromises = [];

  Object.keys(lockerStates).forEach((lockerId) => {
    const state = lockerStates[lockerId];

    if (state.status === "OPEN" && state.userId === currentUserId) {
      console.log(
        `Queueing lock command and DB update for open locker ${lockerId} on logout.`
      );
      lockPromises.push(sendLockCommand(lockerId));

      updateDbPromises.push(
        updateLockerStatus(lockerId, "LOCKED", currentUserId)
      );
    }
  });

  if (lockPromises.length > 0 || updateDbPromises.length > 0) {
    console.log(
      `Attempting to lock ${lockPromises.length} open locker(s) and update DB...`
    );

    Promise.allSettled([...lockPromises, ...updateDbPromises]).then(
      (results) => {
        const failedLocks =
          lockPromises.length > 0
            ? results
                .slice(0, lockPromises.length)
                .filter(
                  (r) =>
                    r.status === "rejected" ||
                    (r.status === "fulfilled" && !r.value)
                )
            : [];
        if (failedLocks.length > 0) {
          alert(
            `⚠️ Có lỗi khi gửi lệnh khóa ${failedLocks.length} tủ. Trạng thái DB có thể đã được cập nhật.`
          );
        } else if (lockPromises.length > 0) {
          alert("Đã gửi lệnh khóa cho các tủ đang mở.");
        }

        sessionStorage.removeItem("user");
        alert("Đăng xuất thành công.");
        window.location.href = "logon.html";
      }
    );
  } else {
    console.log("No open lockers found for user. Logging out directly.");
    sessionStorage.removeItem("user");
    alert("Đăng xuất thành công.");
    window.location.href = "logon.html";
  }
};

window.openLockerSuccess = (lockerId) => {
  console.log(
    `Authentication successful for locker ${lockerId}. Proceeding to open...`
  );
  if (!lockerId) {
    alert("Lỗi: Không có ID tủ khóa để mở.");
    return;
  }
  if (!currentUserId) {
    alert("Lỗi: Không tìm thấy thông tin người dùng.");
    return;
  }

  fetch(`${RENDER_BRIDGE}/raspi/unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lockerId: lockerId, user: currentUser?.email }),
  })
    .then((res) => res.json())
    .then((unlockData) => {
      if (!unlockData.success && unlockData.error) {
        console.error("Physical unlock command failed:", unlockData.error);
        alert(
          "⚠️ Lệnh mở khóa vật lý thất bại: " +
            unlockData.error +
            ". Trạng thái DB sẽ vẫn được cập nhật."
        );
      } else {
        console.log("Physical unlock command acknowledged.");
      }

      return updateLockerStatus(lockerId, "OPEN", currentUserId);
    })
    .then(async (lockerDbUpdated) => {
      if (lockerDbUpdated) {
        console.log(`Locker ${lockerId} status updated to OPEN in DB.`);

        const userLocker = currentUser.registeredLocker;
        let needsUserUpdate = false;
        if (typeof userLocker !== "string" || !/^\d{2}$/.test(userLocker)) {
          console.log(
            `User does not have a valid registered locker. Setting registeredLocker to ${lockerId}.`
          );
          needsUserUpdate = true;
        }

        if (needsUserUpdate) {
          await updateUserField("registeredLocker", lockerId);
        }

        alert(`🔓 Tủ ${lockerId} đã mở thành công! (Relay đang BẬT)`);

        window.location.href = "./index.html";
      } else {
        alert(
          `❌ Lỗi nghiêm trọng: Không thể cập nhật trạng thái tủ ${lockerId} trong cơ sở dữ liệu.`
        );
      }
    })
    .catch((err) => {
      console.error("Error during openLockerSuccess:", err);
      alert(
        "❌ Lỗi không mong muốn xảy ra trong quá trình mở khóa: " + err.message
      );
    });
};

// --- Initialization ---

document.addEventListener("DOMContentLoaded", () => {
  const path = window.location.pathname;
  const isIndex = path.endsWith("index.html") || path === "/";
  const isOpenPage = path.endsWith("open.html");

  if (isIndex || isOpenPage) {
    console.log("Initializing locker logic on page:", path);

    if (isOpenPage) {
      const gridContainer = document.querySelector(".grid-container");
      if (gridContainer) {
        console.log("Setting up grid listeners on open.html");
        gridContainer.addEventListener("click", (e) => {
          const item = e.target.closest(".grid-item");

          if (item && !e.target.closest("button")) {
            e.preventDefault();
            handleLockerClick(item.dataset.lockerId);
          }
        });
      } else {
        console.warn("Grid container not found on open.html");
      }
    }

    fetchLockerStates();
  } else {
    console.log("Skipping locker logic initialization on page:", path);
  }
});
