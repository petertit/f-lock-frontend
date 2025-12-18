const RENDER_BRIDGE = "https://smart-locker-kgnx.onrender.com";
const LOCKER_COUNT = 9;

// --- User Info ---
const userRaw = sessionStorage.getItem("user");
const currentUser = userRaw ? JSON.parse(userRaw) : null;
const currentUserId = currentUser ? currentUser.id : null; // Assumes server sends 'id' string

// --- Global State ---
let lockerStates = {}; // Stores { lockerId: { status, userId } }

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
  if (!currentUserId) return false; // Need user info for the request body
  try {
    console.log(`Sending lock command for locker ${lockerId}`);
    const res = await fetch(`${RENDER_BRIDGE}/raspi/lock`, {
      // Call bridge endpoint
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
    // Store states globally, server sends ownerId as string
    lockerStates = data.lockers.reduce((acc, locker) => {
      acc[locker.lockerId] = { status: locker.status, userId: locker.ownerId }; // ownerId is string ID or null
      return acc;
    }, {});
    console.log("Fetched locker states:", lockerStates);

    updateGridUI(); // Update UI on open.html if present
    if (window.updateSliderUI) {
      // Update UI on index.html if present
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
  const payload = { lockerId, status: newStatus, ownerId: newOwnerId }; // ownerId is string ID or null
  try {
    const res = await fetch(`${RENDER_BRIDGE}/lockers/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      console.log(`Locker ${lockerId} updated successfully on server.`);
      // Update local state immediately
      lockerStates[lockerId] = {
        status: newStatus,
        userId: data.locker.ownerId,
      }; // Use ownerId from response
      updateGridUI(); // Update UI on open.html
      if (window.updateSliderUI) {
        // Update UI on index.html
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

// --- UI Update Function (for open.html Grid) ---

/**
 * Updates the visual representation of the lockers on the open.html page.
 */
function updateGridUI() {
  // Only run if we are on open.html and the grid exists
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

    // Reset everything first
    item.classList.remove("status-empty", "status-locked", "status-open");
    item.style.border = ""; // Use CSS default border initially
    item.style.backgroundColor = "transparent";
    item.style.opacity = "1"; // Reset opacity
    item.onmouseenter = null;
    item.onmouseleave = null;
    item
      .querySelectorAll(".close-btn, .unregister-btn")
      .forEach((btn) => btn.remove());

    // Apply styles based on state
    if (state.status === "EMPTY") {
      item.classList.add("status-empty");
      // Default blue border from CSS will apply
    } else if (state.status === "LOCKED") {
      item.classList.add("status-locked");
      item.style.border = "2px solid red"; // Red border for locked
      item.style.backgroundColor = "rgba(255, 0, 0, 0.3)"; // Dim red background
      if (state.userId === currentUserId) {
        // MY locked locker - Add Unregister button
        addGridButton(item, "HỦY ĐĂNG KÝ", "#ff6600", () =>
          handleUnregister(lockerId)
        );
      } else {
        // Someone else's locked locker - Make it slightly dimmer
        item.style.opacity = "0.7";
      }
    } else if (state.status === "OPEN") {
      if (state.userId === currentUserId) {
        // MY open locker - Green border
        item.classList.add("status-open");
        item.style.border = "2px solid lime";
        item.style.backgroundColor = "rgba(0, 255, 0, 0.2)";
        // Add Close button
        addGridButton(item, "CLOSE", "yellow", () =>
          handleCloseLocker(lockerId)
        );
      } else {
        // Someone else's open locker - Orange border
        item.classList.add("status-locked"); // Treat as locked visually
        item.style.border = "2px solid orange";
        item.style.backgroundColor = "rgba(255, 165, 0, 0.3)";
        item.style.opacity = "0.7";
      }
    }
  });
}

/**
 * Helper to add hover buttons to the grid items on open.html.
 */
function addGridButton(gridItem, text, color, onClickHandler) {
  const button = document.createElement("button");
  button.textContent = text;
  button.className = text === "CLOSE" ? "close-btn" : "unregister-btn"; // Use specific class
  // Basic styling (consistent with slide button)
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

  // Show/hide on hover
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

/**
 * Handles clicks on a locker (either on index.html slider or open.html grid).
 * Determines the action based on the locker state and current user.
 * ASSIGNED TO window.handleLockerClick
 */
function handleLockerClick(lockerId) {
  console.log(`Handling click for locker ${lockerId}`);
  if (!currentUserId) {
    alert("Bạn cần đăng nhập để tương tác với tủ khóa.");
    window.location.href = "./logon.html";
    return;
  }

  const state = lockerStates[lockerId] || { status: "EMPTY", userId: null };

  // Case 1: Locker is EMPTY
  if (state.status === "EMPTY") {
    console.log(`Locker ${lockerId} is EMPTY.`);
    // Check if user already has a registered locker
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

    // Proceed with registration confirmation
    if (confirm(`Tủ ${lockerId} đang trống. Bạn muốn đăng ký và mở tủ này?`)) {
      console.log(
        `User confirmed registration for ${lockerId}. Redirecting to auth method selection...`
      );
      sessionStorage.setItem("locker_to_open", lockerId); // Set which locker to open after auth
      window.location.href = "./face_log.html"; // Go to Face ID / Code choice page
    }
  }
  // Case 2: Locker is NOT EMPTY and BELONGS TO CURRENT USER
  else if (state.userId === currentUserId) {
    console.log(
      `Locker ${lockerId} belongs to current user. Status: ${state.status}`
    );
    if (state.status === "LOCKED") {
      // My locker, but it's locked -> Ask to unlock
      if (confirm(`Đây là tủ của bạn (Tủ ${lockerId}). Bạn muốn mở khóa?`)) {
        console.log(
          `User confirmed unlock for ${lockerId}. Redirecting to auth method selection...`
        );
        sessionStorage.setItem("locker_to_open", lockerId);
        window.location.href = "./face_log.html";
      }
    } else {
      // Status is OPEN
      // My locker, and it's already open -> Do nothing (Close button is available on hover)
      alert(`Tủ ${lockerId} của bạn hiện đang mở.`);
    }
  }
  // Case 3: Locker is NOT EMPTY and BELONGS TO SOMEONE ELSE
  else {
    console.log(`Locker ${lockerId} is occupied by another user.`);
    alert(
      `Tủ ${lockerId} đang ${
        state.status === "OPEN" ? "được sử dụng" : "đã được đăng ký"
      } bởi người khác.`
    );
  }
}
window.handleLockerClick = handleLockerClick; // Make globally accessible

/**
 * Handles the "CLOSE" button click. Sends lock command and updates DB.
 * ASSIGNED TO window.handleCloseLocker
 */
async function handleCloseLocker(lockerId) {
  console.log(`Handling CLOSE button for locker ${lockerId}`);
  if (confirm(`Bạn có chắc muốn đóng và khóa tủ ${lockerId}?`)) {
    // 1. Send physical lock command
    const lockSent = await sendLockCommand(lockerId);
    // 2. Update DB status to LOCKED (keep current owner)
    // We update the DB regardless of whether the physical lock command succeeded,
    // as the user's intent is to close it. The physical lock might fail if Pi is offline.
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

/**
 * Handles the "UNREGISTER" button click. Sends lock command, updates DB (EMPTY, null owner), updates user profile.
 * ASSIGNED TO window.handleUnregister
 */
async function handleUnregister(lockerId) {
  console.log(`Handling UNREGISTER button for locker ${lockerId}`);
  if (
    confirm(
      `Bạn có chắc muốn hủy đăng ký tủ ${lockerId}? Tủ sẽ được khóa lại và trở thành trống.`
    )
  ) {
    // 1. Send physical lock command first (ensure it's locked before releasing)
    await sendLockCommand(lockerId); // We try to lock, but proceed even if it fails

    // 2. Update locker status in DB to EMPTY and owner to null
    const lockerUpdated = await updateLockerStatus(lockerId, "EMPTY", null);

    if (lockerUpdated) {
      // 3. Update user's registeredLocker field to null in DB
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

/**
 * Handles user logout. Finds any OPEN lockers belonging to the user, sends lock commands, updates their DB status to LOCKED, then logs out.
 * ASSIGNED TO window.handleLogoutAndLock
 */
window.handleLogoutAndLock = function () {
  console.log("Handling logout and lock...");
  if (!currentUserId) {
    // Should not happen if called from protected pages, but check anyway
    sessionStorage.removeItem("user");
    window.location.href = "logon.html";
    return;
  }

  const lockPromises = []; // Promises for sending physical lock commands
  const updateDbPromises = []; // Promises for updating DB status to LOCKED

  Object.keys(lockerStates).forEach((lockerId) => {
    const state = lockerStates[lockerId];
    // Find MY lockers that are currently OPEN
    if (state.status === "OPEN" && state.userId === currentUserId) {
      console.log(
        `Queueing lock command and DB update for open locker ${lockerId} on logout.`
      );
      lockPromises.push(sendLockCommand(lockerId));
      // Update DB to LOCKED, keep current user as owner
      updateDbPromises.push(
        updateLockerStatus(lockerId, "LOCKED", currentUserId)
      );
    }
  });

  // If there were any open lockers to lock
  if (lockPromises.length > 0 || updateDbPromises.length > 0) {
    console.log(
      `Attempting to lock ${lockPromises.length} open locker(s) and update DB...`
    );
    // Wait for all commands and DB updates to finish (or fail)
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
        // Proceed to logout regardless of lock success/failure
        sessionStorage.removeItem("user");
        alert("Đăng xuất thành công.");
        window.location.href = "logon.html";
      }
    );
  } else {
    // No open lockers found, just log out
    console.log("No open lockers found for user. Logging out directly.");
    sessionStorage.removeItem("user");
    alert("Đăng xuất thành công.");
    window.location.href = "logon.html";
  }
};

/**
 * Callback function executed after successful authentication (Face ID or Code).
 * Sends physical unlock command, updates DB status to OPEN, updates user's registered locker (if needed), redirects.
 * ASSIGNED TO window.openLockerSuccess
 */
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

  // 1. Send physical UNLOCK command (Turn Relay ON)
  fetch(`${RENDER_BRIDGE}/raspi/unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lockerId: lockerId, user: currentUser?.email }),
  })
    .then((res) => res.json())
    .then((unlockData) => {
      if (!unlockData.success && unlockData.error) {
        // Log error but continue - DB state is more critical
        console.error("Physical unlock command failed:", unlockData.error);
        alert(
          "⚠️ Lệnh mở khóa vật lý thất bại: " +
            unlockData.error +
            ". Trạng thái DB sẽ vẫn được cập nhật."
        );
      } else {
        console.log("Physical unlock command acknowledged.");
      }
      // 2. Update DB status to OPEN and set current user as owner
      return updateLockerStatus(lockerId, "OPEN", currentUserId);
    })
    .then(async (lockerDbUpdated) => {
      if (lockerDbUpdated) {
        console.log(`Locker ${lockerId} status updated to OPEN in DB.`);
        // 3. Update user's registeredLocker field if this is their first registration
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
        // 4. Redirect to index page (where the slider is)
        window.location.href = "./index.html";
      } else {
        // DB update failed, this is critical
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

/**
 * Initializes the locker interaction logic when the DOM is ready.
 * Fetches initial locker states and sets up grid listeners if on open.html.
 */
document.addEventListener("DOMContentLoaded", () => {
  const path = window.location.pathname;
  const isIndex = path.endsWith("index.html") || path === "/"; // Check if it's the root or index.html
  const isOpenPage = path.endsWith("open.html");

  // Only run fetch/setup logic on relevant pages
  if (isIndex || isOpenPage) {
    console.log("Initializing locker logic on page:", path);

    // Setup grid listeners ONLY on open.html
    if (isOpenPage) {
      const gridContainer = document.querySelector(".grid-container");
      if (gridContainer) {
        console.log("Setting up grid listeners on open.html");
        gridContainer.addEventListener("click", (e) => {
          const item = e.target.closest(".grid-item");
          // Prevent action if clicking on buttons inside the grid item
          if (item && !e.target.closest("button")) {
            // Check if target or ancestor is a button
            e.preventDefault();
            handleLockerClick(item.dataset.lockerId);
          }
        });
      } else {
        console.warn("Grid container not found on open.html");
      }
    }

    // Fetch initial states for both pages
    fetchLockerStates();
  } else {
    console.log("Skipping locker logic initialization on page:", path);
  }
});
