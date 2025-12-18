document.addEventListener("DOMContentLoaded", () => {
  const sliderTrack = document.querySelector(".slider-track");
  if (!sliderTrack) return;
  sliderTrack.addEventListener("click", (e) => {
    const slide = e.target.closest(".slide:not(.clone)");
    if (!slide) return;

    e.preventDefault();

    const lockerId = slide.dataset.lockerId;

    if (!window.handleLockerClick) {
      console.error("Lỗi: Hàm handleLockerClick (từ open.js) không tồn tại.");
      alert("Lỗi tải chức năng tương tác tủ khóa.");
      return;
    }

    window.handleLockerClick(lockerId);
  });
  window.updateSliderUI = (lockerStates) => {
    const slides = sliderTrack.querySelectorAll(".slide:not(.clone)");

    slides.forEach((slide) => {
      const lockerId = slide.dataset.lockerId;
      const state = lockerStates[lockerId] || { status: "EMPTY", userId: null };
      const userRaw = sessionStorage.getItem("user");
      const currentUser = userRaw ? JSON.parse(userRaw) : null;
      const currentUserId = currentUser ? currentUser.id : null;

      slide.classList.remove("status-empty", "status-locked", "status-open");
      slide.style.border = "3px solid rgba(255, 255, 255, 0.6)";
      slide.style.backgroundColor = "";
      slide.querySelectorAll(".slide-button").forEach((btn) => btn.remove());
      if (state.status === "EMPTY") {
        slide.classList.add("status-empty");
      } else if (state.status === "LOCKED") {
        slide.classList.add("status-locked");
        if (state.userId === currentUserId) {
          slide.style.border = "3px solid red";
          addSlideButton(slide, "HỦY ĐĂNG KÝ", "#ff6600", () =>
            handleUnregister(lockerId)
          );
        } else {
          slide.style.border = "3px solid red";
          slide.style.opacity = "0.7";
        }
      } else if (state.status === "OPEN") {
        if (state.userId === currentUserId) {
          slide.classList.add("status-open");
          slide.style.border = "3px solid lime";
          addSlideButton(slide, "ĐÓNG TỦ", "yellow", () =>
            handleCloseLocker(lockerId)
          );
        } else {
          slide.classList.add("status-locked");
          slide.style.border = "3px solid orange";
          slide.style.opacity = "0.7";
        }
      }
    });
  };
  function addSlideButton(slide, text, color, onClickHandler) {
    const button = document.createElement("button");
    button.textContent = text;
    button.className = "slide-button";
    button.style.position = "absolute";
    button.style.bottom = "15px";
    button.style.left = "50%";
    button.style.transform = "translateX(-50%)";
    button.style.padding = "6px 12px";
    button.style.fontSize = "14px";
    button.style.backgroundColor = color;
    button.style.color = color === "yellow" ? "black" : "white";
    button.style.border = "none";
    button.style.borderRadius = "5px";
    button.style.cursor = "pointer";
    button.style.zIndex = "5";
    button.style.opacity = "0";
    button.style.visibility = "hidden";
    button.style.transition = "opacity 0.2s ease";

    button.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClickHandler();
    };

    slide.appendChild(button);

    slide.onmouseenter = () => {
      button.style.visibility = "visible";
      button.style.opacity = "1";
    };
    slide.onmouseleave = () => {
      button.style.visibility = "hidden";
      button.style.opacity = "0";
    };
  }
});
