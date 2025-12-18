const buttons = {
  faceid: {
    imgSrc: "../design/SOURCE_IMAGE/faceid.png",
    rotateDeg: -10,
    marginTop: "10px",
    liIndex: 0,
  },
  smartkey: {
    imgSrc: "../design/SOURCE_IMAGE/smartkey.png",
    rotateDeg: 10,
    marginTop: "20px",
    liIndex: 1,
  },
  tracking: {
    imgSrc: "../design/SOURCE_IMAGE/tracking.png",
    rotateDeg: 20,
    marginTop: "10px",
    liIndex: 2,
  },
  remote: {
    imgSrc: "../design/SOURCE_IMAGE/remote.png",
    rotateDeg: 0,
    marginTop: "20px",
    liIndex: 3,
  },
};

const image = document.querySelector(".rotated-image");
const imgPlaceholder = document.querySelector(".img-placeholder");
const listItems = document.querySelectorAll(".what-we-do ul li");
const buttonGrid = document.querySelector(".button-grid");
let activeButton = null;

function updateState(key) {
  if (activeButton) {
    activeButton.classList.remove("active");
  }

  const data = buttons[key];
  const buttonToActivate = document.getElementById(key + "-btn");
  if (buttonToActivate) {
    buttonToActivate.classList.add("active");
    activeButton = buttonToActivate;
  }

  image.src = data.imgSrc;
  image.style.transform = `rotate(${data.rotateDeg}deg)`;
  imgPlaceholder.style.marginTop = data.marginTop;

  listItems.forEach((li, index) => {
    li.style.opacity = index === data.liIndex ? "1" : "0.5";
  });
}

updateState("faceid");

buttonGrid.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  let key;
  if (button.id === "faceid-btn") key = "faceid";
  else if (button.id === "tracking-btn") key = "tracking";
  else if (button.id === "smartkey-btn") key = "smartkey";
  else if (button.id === "remote-btn") key = "remote";

  if (key && buttons[key]) {
    updateState(key);
  }
});
listItems.forEach((li, index) => {
  if (index === data.liIndex) {
    li.classList.add("active");
  } else {
    li.classList.remove("active");
  }
});
