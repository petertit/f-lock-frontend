document.addEventListener("DOMContentLoaded", () => {
  const track = document.querySelector(".slider-track");
  const viewport = document.querySelector(".slider-viewport");
  const prevBtn = document.querySelector(".prev");
  const nextBtn = document.querySelector(".next");

  if (!track || !viewport) return;

  const slides = Array.from(track.children);
  if (slides.length === 0) return;

  const trackStyles = window.getComputedStyle(track);
  const GAP = parseInt(trackStyles.gap) || 0;

  // Clone for infinite loop
  const firstClone = slides[0].cloneNode(true);
  const lastClone = slides[slides.length - 1].cloneNode(true);
  track.appendChild(firstClone);
  track.insertBefore(lastClone, slides[0]);

  let currentIndex = 1;
  const allSlides = Array.from(track.children);

  function setActive() {
    allSlides.forEach((s) => s.classList.remove("active"));
    allSlides[currentIndex]?.classList.add("active");
  }

  function updatePosition(animate = true) {
    track.style.transition = animate ? "transform 0.5s ease" : "none";

    const activeSlide = allSlides[currentIndex];
    if (!activeSlide) return;

    const offsetX =
      viewport.offsetWidth / 2 -
      (activeSlide.offsetLeft + activeSlide.offsetWidth / 2);

    track.style.transform = `translateX(${offsetX}px)`;
    setActive();
  }

  nextBtn?.addEventListener("click", () => {
    currentIndex++;
    updatePosition();

    track.addEventListener(
      "transitionend",
      () => {
        if (currentIndex === allSlides.length - 1) {
          currentIndex = 1;
          updatePosition(false);
        }
      },
      { once: true }
    );
  });

  prevBtn?.addEventListener("click", () => {
    currentIndex--;
    updatePosition();

    track.addEventListener(
      "transitionend",
      () => {
        if (currentIndex === 0) {
          currentIndex = allSlides.length - 2;
          updatePosition(false);
        }
      },
      { once: true }
    );
  });

  window.addEventListener("resize", () => updatePosition(false));
  updatePosition(false);
});
