// auth_protect.js
(function protectPages() {
  const openPages = ["logon.html", "register.html"];

  let current = window.location.pathname.split("/").pop().toLowerCase();
  if (!current) current = "index.html";

  const user = sessionStorage.getItem("user");

  document.querySelectorAll("#logout-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (window.handleLogoutAndLock) {
        window.handleLogoutAndLock();
      } else {
        sessionStorage.removeItem("user");
        window.location.href = "logon.html";
      }
    });
  });

  if (!user && !openPages.includes(current)) {
    alert("⚠️ Please login first!");
    window.location.href = "logon.html";
    return;
  }

  if (user && openPages.includes(current)) {
    window.location.href = "index.html";
    return;
  }
})();
