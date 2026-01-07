// scripts/admin.js
import { API_BASE } from "../api/api.js";

document.addEventListener("DOMContentLoaded", () => {
  const statusEl = document.getElementById("status");
  const tbody = document.getElementById("usersTbody");
  const searchInput = document.getElementById("searchInput");
  const refreshBtn = document.getElementById("refreshBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  const editModal = document.getElementById("editModal");
  const closeModalBtn = document.getElementById("closeModalBtn");
  const cancelBtn = document.getElementById("cancelBtn");
  const saveBtn = document.getElementById("saveBtn");
  const modalStatus = document.getElementById("modalStatus");

  const editUserId = document.getElementById("editUserId");
  const editName = document.getElementById("editName");
  const editUsername = document.getElementById("editUsername");
  const editEmail = document.getElementById("editEmail");
  const editPhone = document.getElementById("editPhone");

  const ADMIN_API = `${API_BASE}/admin`;

  let allUsers = [];

  function token() {
    return sessionStorage.getItem("token");
  }
  function currentUser() {
    try {
      return JSON.parse(sessionStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  }

  function setStatus(msg, color = "#aaa") {
    statusEl.textContent = msg;
    statusEl.style.color = color;
  }
  function setModalStatus(msg, color = "#aaa") {
    modalStatus.textContent = msg || "";
    modalStatus.style.color = color;
  }

  async function apiFetch(url, opts = {}) {
    const t = token();
    if (!t) throw new Error("Missing token. Please login again.");

    const res = await fetch(url, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${t}`,
        ...(opts.headers || {}),
      },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
    }
    return data;
  }

  function pill(text, type = "ok") {
    return `<span class="admin-pill ${type}">${text}</span>`;
  }

  function fmtDate(d) {
    try {
      const dt = new Date(d);
      return dt.toLocaleString();
    } catch {
      return "";
    }
  }

  function render(users) {
    if (!users.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center;color:#aaa;padding:18px">
            No users found.
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = users
      .map((u) => {
        const lockerId = u?.locker?.lockerId ?? null;
        const lockerStatus = u?.locker?.status ?? null;

        const lockerText = lockerId
          ? `#${String(lockerId).padStart(2, "0")} • ${lockerStatus || "N/A"}`
          : "—";

        const tag =
          u.email?.toLowerCase() === "admin@gmail.com"
            ? pill("ADMIN", "warn")
            : pill("USER", "ok");

        const lockerTag = lockerId
          ? pill(lockerText, lockerStatus === "OPEN" ? "warn" : "ok")
          : pill("NO LOCKER", "bad");

        return `
          <tr>
            <td>
              <div style="display:flex;flex-direction:column;gap:4px">
                <div style="font-weight:700">${
                  u.name || "(no name)"
                } ${tag}</div>
                <div style="color:#aaa;font-size:13px">@${
                  u.username || ""
                }</div>
              </div>
            </td>
            <td>${u.email || ""}</td>
            <td>${u.phone || ""}</td>
            <td>${fmtDate(u.createdAt)}</td>
            <td>${lockerTag}</td>
            <td>
              <div class="admin-actions-inline">
                <button class="btn admin-mini admin-btn" data-act="edit" data-id="${
                  u._id
                }">
                  Edit
                </button>
                <button class="btn admin-mini admin-btn btn-danger" data-act="delete" data-id="${
                  u._id
                }">
                  Delete
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function openModal(u) {
    editUserId.value = u._id;
    editName.value = u.name || "";
    editUsername.value = u.username || "";
    editEmail.value = u.email || "";
    editPhone.value = u.phone || "";

    setModalStatus("");
    editModal.classList.remove("hidden");
  }

  function closeModal() {
    editModal.classList.add("hidden");
    setModalStatus("");
  }

  function applyFilter() {
    const q = (searchInput.value || "").trim().toLowerCase();
    if (!q) {
      render(allUsers);
      return;
    }
    const filtered = allUsers.filter((u) => {
      const s = `${u.name || ""} ${u.username || ""} ${u.email || ""} ${
        u.phone || ""
      }`.toLowerCase();
      return s.includes(q);
    });
    render(filtered);
  }

  async function loadUsers() {
    setStatus("Loading users...", "#aaa");
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center;color:#aaa;padding:18px">
          Loading users...
        </td>
      </tr>`;

    const data = await apiFetch(`${ADMIN_API}/users`, { method: "GET" });
    allUsers = Array.isArray(data?.users) ? data.users : [];
    setStatus(`Loaded ${allUsers.length} users.`, "#00ff66");
    applyFilter();
  }

  async function onDelete(id) {
    const u = allUsers.find((x) => x._id === id);
    if (!u) return;

    if (u.email?.toLowerCase() === "admin@gmail.com") {
      alert("Cannot delete admin account.");
      return;
    }

    const ok = confirm(`Delete user:\n${u.email}\n\nThis cannot be undone.`);
    if (!ok) return;

    setStatus("Deleting...", "#ffaa00");
    await apiFetch(`${ADMIN_API}/users/${id}`, { method: "DELETE" });
    setStatus("Deleted ✅", "#00ff66");
    await loadUsers();
  }

  async function onSave() {
    const id = editUserId.value;
    if (!id) return;

    setModalStatus("Saving...", "#ffaa00");

    const patch = {
      name: editName.value,
      username: editUsername.value,
      email: editEmail.value,
      phone: editPhone.value,
    };

    await apiFetch(`${ADMIN_API}/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });

    setModalStatus("Saved ✅", "#00ff66");
    await loadUsers();
    setTimeout(closeModal, 350);
  }

  // ====== Guard: only admin can view ======
  (function guardAdmin() {
    const u = currentUser();
    if (!u?.email || String(u.email).toLowerCase() !== "admin@gmail.com") {
      alert("❌ Admin only");
      window.location.href = "./index.html";
      return;
    }
  })();

  // Events
  refreshBtn.addEventListener("click", loadUsers);
  logoutBtn.addEventListener("click", () => {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    window.location.href = "./logon.html";
  });

  searchInput.addEventListener("input", applyFilter);

  tbody.addEventListener("click", (e) => {
    const btn = e.target?.closest("button[data-act]");
    if (!btn) return;

    const act = btn.getAttribute("data-act");
    const id = btn.getAttribute("data-id");
    const u = allUsers.find((x) => x._id === id);
    if (!u) return;

    if (act === "edit") openModal(u);
    if (act === "delete") onDelete(id);
  });

  closeModalBtn.addEventListener("click", closeModal);
  cancelBtn.addEventListener("click", closeModal);
  editModal.addEventListener("click", (e) => {
    if (e.target === editModal) closeModal();
  });

  saveBtn.addEventListener("click", onSave);

  // Start
  loadUsers().catch((err) => {
    console.error(err);
    setStatus("❌ " + err.message, "#ff3333");
  });
});
