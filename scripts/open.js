import { API_BASE } from "../api/api.js";

const RENDER_BRIDGE = (API_BASE || "").replace(/\/+$/, ""); // bỏ slash cuối

const userRaw = sessionStorage.getItem("user");
const currentUser = userRaw ? JSON.parse(userRaw) : null;
const currentUserId = currentUser ? currentUser._id || currentUser.id : null;

let lockerStates = {};

const USER_UPDATE_ENDPOINTS = ["/auth/update", "/update", "/account/update"];

//Helpers: fetch + safe JSON

async function fetchJSON(url, options = {}) {
  let res;
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
  } catch (err) {
    throw new Error(
      `Không gọi được API (Network/CORS). URL: ${url} | ${err.message}`
    );
  }

  const text = await res.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    throw new Error(
      `API trả về không phải JSON (HTTP ${res.status}). Có thể backend đang lỗi/route sai.\n` +
        `URL: ${url}\n` +
        `Response đầu: ${text.slice(0, 120)}`
    );
  }

  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }

  return data;
}

//User update

async function updateUserField(field, value) {
  if (!currentUserId) return false;

  for (const ep of USER_UPDATE_ENDPOINTS) {
    const url = `${RENDER_BRIDGE}${ep}`;
    try {
      const data = await fetchJSON(url, {
        method: "POST",
        body: JSON.stringify({ id: currentUserId, [field]: value }),
      });

      if (data?.user) {
        sessionStorage.setItem("user", JSON.stringify(data.user));
        Object.assign(currentUser, data.user);
        console.log(`✅ Updated user field '${field}' to '${value}' via ${ep}`);
        return true;
      }

      console.error(`❌ Update user failed via ${ep}:`, data?.error || data);
      alert(
        `❌ Lỗi cập nhật người dùng: ${data?.error || "Không thể cập nhật"}`
      );
      return false;
    } catch (err) {
      // nếu endpoint này không tồn tại => thử endpoint tiếp theo
      if (String(err.message).includes("HTTP 404")) continue;
      console.warn(`⚠️ Error updating user via ${ep}:`, err.message);
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

//Raspi commands

async function sendLockCommand(lockerId) {
  if (!currentUserId) return false;

  const url = `${RENDER_BRIDGE}/raspi/lock`;
  try {
    const data = await fetchJSON(url, {
      method: "POST",
      body: JSON.stringify({ lockerId, user: currentUser?.email }),
    });

    if (data.success) {
      console.log(`✅ Lock command acknowledged for ${lockerId}.`);
      return true;
    }

    console.error(
      `❌ Lock command failed for ${lockerId}:`,
      data.error || data
    );
    return false;
  } catch (err) {
    console.error(
      `❌ Error sending lock command for ${lockerId}:`,
      err.message
    );
    return false;
  }
}

//Locker state

async function fetchLockerStates() {
  const url = `${RENDER_BRIDGE}/lockers/status`;
  try {
    const data = await fetchJSON(url);

    if (!data.success || !Array.isArray(data.lockers)) {
      throw new Error(data.error || "Invalid data structure from server");
    }

    lockerStates = data.lockers.reduce((acc, locker) => {
      acc[locker.lockerId] = { status: locker.status, userId: locker.ownerId };
      return acc;
    }, {});

    console.log("✅ Fetched locker states:", lockerStates);

    updateGridUI();
    if (window.updateSliderUI) window.updateSliderUI(lockerStates);
  } catch (err) {
    console.error("❌ Error loading locker states:", err.message);
    alert("Không thể tải trạng thái tủ khóa: " + err.message);
  }
}

async function updateLockerStatus(lockerId, newStatus, newOwnerId) {
  const url = `${RENDER_BRIDGE}/lockers/update`;
  console.log(
    `Updating locker ${lockerId} => ${newStatus}, owner=${newOwnerId}`
  );

  try {
    const data = await fetchJSON(url, {
      method: "POST",
      body: JSON.stringify({
        lockerId,
        status: newStatus,
        ownerId: newOwnerId,
      }),
    });

    if (data.success) {
      lockerStates[lockerId] = {
        status: newStatus,
        userId: data?.locker?.ownerId || newOwnerId,
      };

      updateGridUI();
      if (window.updateSliderUI) window.updateSliderUI(lockerStates);
      return true;
    }

    alert(`❌ Lỗi: ${data.error || "Không thể cập nhật trạng thái tủ."}`);
    return false;
  } catch (err) {
    console.error(`❌ Error updating locker ${lockerId}:`, err.message);
    alert(`❌ Lỗi khi cập nhật tủ ${lockerId}: ${err.message}`);
    return false;
  }
}

//UI

function updateGridUI() {
  const gridContainer = document.querySelector(".grid-container");

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

//Events

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

  const url = `${RENDER_BRIDGE}/raspi/unlock`;

  fetchJSON(url, {
    method: "POST",
    body: JSON.stringify({ lockerId, user: currentUser?.email }),
  })
    .catch((unlockErr) => {
      alert(
        "⚠️ Lệnh mở khóa vật lý thất bại: " +
          unlockErr.message +
          ". DB vẫn sẽ cập nhật."
      );
      return { success: false };
    })
    .then(() => updateLockerStatus(lockerId, "OPEN", currentUserId))
    .then(async (dbOk) => {
      if (!dbOk)
        return alert(
          `❌ Không thể cập nhật trạng thái tủ ${lockerId} trong DB.`
        );

      const userLocker = currentUser?.registeredLocker;
      const needsUserUpdate =
        typeof userLocker !== "string" || !/^\d{2}$/.test(userLocker);
      if (needsUserUpdate) await updateUserField("registeredLocker", lockerId);

      alert(`🔓 Tủ ${lockerId} đã mở thành công! (Relay đang BẬT)`);
      window.location.href = "./index.html";
    })
    .catch((err) => alert("❌ Lỗi mở khóa: " + err.message));
};

//Init

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
