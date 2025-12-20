// slide_interaction.js
// Dùng cho index.html (slider).
// - Mỗi slide phải có data-locker-id="01"..."06"
// - Click slide => gọi window.handleLockerClick(lockerId)
// - updateSliderUI(lockerStates) => tô màu đúng yêu cầu

document.addEventListener("DOMContentLoaded", () => {
  const sliderTrack = document.querySelector(".slider-track");
  if (!sliderTrack) return;

  // Click slide => tương tác như open.html
  sliderTrack.addEventListener("click", (e) => {
    const slide = e.target.closest(".slide:not(.clone)");
    if (!slide) return;

    // bấm nút trên slide thì không trigger click slide
    if (e.target.closest("button")) return;

    e.preventDefault();

    const lockerId = slide.dataset.lockerId;
    if (!lockerId) return;

    if (typeof window.handleLockerClick !== "function") {
      console.error(
        "Thiếu window.handleLockerClick. Hãy import open.js trước slide_interaction.js"
      );
      alert("Lỗi tải chức năng tương tác tủ khóa.");
      return;
    }

    window.handleLockerClick(lockerId);
  });

  function getCurrentUserId() {
    const raw = sessionStorage.getItem("user");
    const u = raw ? JSON.parse(raw) : null;
    return u ? String(u._id || u.id) : null;
  }

  function normalizeId(id) {
    if (id == null) return null;
    return String(id);
  }

  function applySlideStyle(slide, state, isMine) {
    slide.classList.remove(
      "status-empty",
      "status-locked",
      "status-open",
      "status-other"
    );
    slide.style.border = "";
    slide.style.backgroundColor = "";
    slide.style.opacity = "1";
    slide.style.position = "relative";

    if (state.status === "EMPTY") {
      slide.classList.add("status-empty");
      slide.style.border = "3px solid rgba(255,255,255,0.35)";
      return;
    }

    if (isMine) {
      if (state.status === "LOCKED") {
        slide.classList.add("status-locked");
        slide.style.border = "3px solid #ffd000"; // vàng
        slide.style.backgroundColor = "rgba(255, 208, 0, 0.14)";
      } else if (state.status === "OPEN") {
        slide.classList.add("status-open");
        slide.style.border = "3px solid #00ff66"; // xanh
        slide.style.backgroundColor = "rgba(0, 255, 102, 0.12)";
      } else {
        slide.classList.add("status-locked");
        slide.style.border = "3px solid #ffd000";
      }
    } else {
      slide.classList.add("status-other");
      slide.style.border = "3px solid #ff2a2a"; // đỏ
      slide.style.backgroundColor = "rgba(255, 42, 42, 0.12)";
      slide.style.opacity = "0.85";
    }
  }

  function addSlideButton(slide, text, bg, color, onClickHandler) {
    // remove old
    slide.querySelectorAll(".slide-button").forEach((btn) => btn.remove());

    const button = document.createElement("button");
    button.textContent = text;
    button.className = "slide-button";
    button.type = "button";

    button.style.position = "absolute";
    button.style.bottom = "15px";
    button.style.left = "50%";
    button.style.transform = "translateX(-50%)";
    button.style.padding = "6px 12px";
    button.style.fontSize = "14px";
    button.style.backgroundColor = bg;
    button.style.color = color;
    button.style.border = "none";
    button.style.borderRadius = "8px";
    button.style.cursor = "pointer";
    button.style.zIndex = "5";
    button.style.opacity = "0";
    button.style.visibility = "hidden";
    button.style.transition = "opacity 0.2s ease";

    button.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClickHandler?.();
    };

    slide.appendChild(button);

    slide.addEventListener("mouseenter", () => {
      button.style.visibility = "visible";
      button.style.opacity = "1";
    });
    slide.addEventListener("mouseleave", () => {
      button.style.visibility = "hidden";
      button.style.opacity = "0";
    });
  }

  // expose để open.js gọi
  window.updateSliderUI = (lockerStates) => {
    const slides = sliderTrack.querySelectorAll(".slide:not(.clone)");
    const currentUserId = getCurrentUserId();

    slides.forEach((slide) => {
      const lockerId = slide.dataset.lockerId;
      const state = lockerStates?.[lockerId] || {
        status: "EMPTY",
        userId: null,
      };
      const isMine =
        currentUserId &&
        normalizeId(state.userId) === normalizeId(currentUserId);

      applySlideStyle(slide, state, isMine);

      // Nếu là tủ của mình và NOT EMPTY => hover có nút hủy đăng ký
      slide.querySelectorAll(".slide-button").forEach((btn) => btn.remove());

      if (isMine && state.status !== "EMPTY") {
        if (typeof window.handleUnregister === "function") {
          addSlideButton(slide, "HỦY ĐĂNG KÝ", "#ff8800", "#fff", () =>
            window.handleUnregister(lockerId)
          );
        }
      }
    });
  };

  // Nếu open.js đã fetch xong trước đó, cập nhật UI luôn
  if (window.__lockerStates && typeof window.updateSliderUI === "function") {
    window.updateSliderUI(window.__lockerStates);
  }
});
