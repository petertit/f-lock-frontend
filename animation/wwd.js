document.addEventListener("DOMContentLoaded", () => {
  const buttons = {
    faceid: {
      imgSrc: "./design/SOURCE_IMAGE/faceid.png",
      rotateDeg: -10,
      marginTop: "10px",
      liIndex: 0,
    },
    smartkey: {
      imgSrc: "./design/SOURCE_IMAGE/smartkey.png",
      rotateDeg: 10,
      marginTop: "20px",
      liIndex: 1,
    },
    tracking: {
      imgSrc: "./design/SOURCE_IMAGE/tracking.png",
      rotateDeg: 20,
      marginTop: "10px",
      liIndex: 2,
    },
    remote: {
      imgSrc: "./design/SOURCE_IMAGE/remote.png",
      rotateDeg: 0,
      marginTop: "20px",
      liIndex: 3,
    },
  };

  const image = document.querySelector(".rotated-image");
  const imgPlaceholder = document.querySelector(".img-placeholder");
  const listItems = document.querySelectorAll(".what-we-do ul li");
  const buttonGrid = document.querySelector(".button-grid");

  if (!image || !buttonGrid) return;

  let activeButton = null;

  function updateState(key) {
    const data = buttons[key];
    if (!data) return;

    if (activeButton) activeButton.classList.remove("active");

    const btn = document.getElementById(`${key}-btn`);
    if (btn) {
      btn.classList.add("active");
      activeButton = btn;
    }

    image.style.opacity = "0";
    setTimeout(() => {
      image.src = data.imgSrc;
      image.style.transform = `rotate(${data.rotateDeg}deg)`;
      image.style.opacity = "1";
    }, 120);

    imgPlaceholder.style.marginTop = data.marginTop;

    listItems.forEach((li, index) => {
      li.style.opacity = index === data.liIndex ? "1" : "0.4";
      li.classList.toggle("active", index === data.liIndex);
    });
  }

  buttonGrid.addEventListener("click", (e) => {
    const button = e.target.closest("button");
    if (!button) return;

    const key = button.id.replace("-btn", "");
    if (buttons[key]) updateState(key);
  });

  updateState("faceid");
});
