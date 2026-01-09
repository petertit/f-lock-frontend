// scripts/admin_nav.js
document.addEventListener("DOMContentLoaded", () => {
  const adminLink = document.getElementById("adminNav");
  if (!adminLink) return;

  function getUser() {
    try {
      return JSON.parse(sessionStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  }

  const user = getUser();
  const isAdmin = (user?.email || "").toLowerCase() === "admin@gmail.com";

  adminLink.style.display = isAdmin ? "inline-flex" : "none";
});
