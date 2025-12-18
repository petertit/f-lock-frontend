document.addEventListener("DOMContentLoaded", () => {
  const track = document.querySelector(".slider-track");
  const slides = Array.from(track.children);
  const prevBtn = document.querySelector(".prev");
  const nextBtn = document.querySelector(".next");
  const viewport = document.querySelector(".slider-viewport");

  const trackStyles = window.getComputedStyle(track);
  const GAP = parseInt(trackStyles.gap) || 0;

  const slideWidth = slides[0].offsetWidth + GAP;

  // Clone cho infinite loop
  const firstClone = slides[0].cloneNode(true);
  const lastClone = slides[slides.length - 1].cloneNode(true);
  track.appendChild(firstClone);
  track.insertBefore(lastClone, slides[0]);

  let currentIndex = 1; // bắt đầu từ slide thật đầu tiên (sau clone)
  const allSlides = Array.from(track.children);

  function setActive() {
    allSlides.forEach((s) => s.classList.remove("active"));
    allSlides[currentIndex].classList.add("active");
  }

  function updatePosition(animate = true) {
    if (!animate) track.style.transition = "none";
    else track.style.transition = "transform 0.5s ease";

    const viewportWidth = viewport.offsetWidth;
    const activeSlide = allSlides[currentIndex];

    // offsetLeft của slide active
    const activeLeft = activeSlide.offsetLeft;
    const activeWidth = activeSlide.offsetWidth;

    // tính dịch chuyển để slide active ra giữa
    const offsetX = viewportWidth / 2 - (activeLeft + activeWidth / 2);

    track.style.transform = `translateX(${offsetX}px)`;
    setActive();
  }

  nextBtn.addEventListener("click", () => {
    currentIndex++;
    updatePosition();

    track.addEventListener(
      "transitionend",
      () => {
        if (currentIndex === allSlides.length - 1) {
          currentIndex = 1; // reset về slide thật 01
          updatePosition(false);
        }
      },
      { once: true }
    );
  });

  prevBtn.addEventListener("click", () => {
    currentIndex--;
    updatePosition();

    track.addEventListener(
      "transitionend",
      () => {
        if (currentIndex === 0) {
          currentIndex = allSlides.length - 2; // reset về slide thật 09
          updatePosition(false);
        }
      },
      { once: true }
    );
  });

  window.addEventListener("resize", () => updatePosition(false));

  updatePosition(false);
});
