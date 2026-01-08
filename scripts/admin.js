// scripts/admin.js (frontend)
import { apiFetch, clearAuth } from "./api/http.js"; // nếu bạn để http.js ở root
// Nếu http.js nằm cùng thư mục scripts thì đổi thành: "./http.js"

const els = {
  status: document.getElementById("status"),
  tbody: document.getElementById("usersTbody"),
  search: document.getElementById("searchInput"),
  refresh: document.getElementById("refreshBtn"),
  logout: document.getElementById("logoutBtn"),

  modal: document.getElementById("editModal"),
  closeModal: document.getElementById("closeModalBtn"),
  cancel: document.getElementById("cancelBtn"),
  save: document.getElementById("saveBtn"),
  modalStatus: document.getElementById("modalStatus"),

  editUserId: document.getElementById("editUserId"),
  editName: document.getElementById("editName"),
  editEmail: document.getElementById("editEmail"),
  editPhone: document.getElementById("editPhone"),
  editLockerCode: document.getElementById("editLockerCode"),
};

let allUsers = [];

function setStatus(msg, color = "#7CFF9B") {
  if (!els.status) return;
  els.status.textContent = msg;
  els.status.style.color = color;
}

function setModalStatus(msg, color = "#7CFF9B") {
  if (!els.modalStatus) return;
  els.modalStatus.textContent = msg;
  els.modalStatus.style.color = color;
}

function openModal() {
  els.modal?.classList.remove("hidden");
}
function closeModal() {
  els.modal?.classList.add("hidden");
  setModalStatus("");
}

function isAdminUser(u) {
  return String(u?.email || "").toLowerCase() === "admin@gmail.com";
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
  if (!els.tbody) return;

  if (!users.length) {
    els.tbody.innerHTML = `
      <tr><td colspan="6" style="text-align:center;color:#aaa;padding:18px">
        No users
      </td></tr>`;
    return;
  }

  els.tbody.innerHTML = users
    .map((u) => {
      const role = isAdminUser(u) ? "ADMIN" : "USER";
      const lockerText = u?.locker?.lockerId
        ? `${u.locker.lockerId} (${u.locker.status || ""})`
        : u.registeredLocker
        ? `${u.registeredLocker}`
        : "-";

      return `
      <tr>
        <td>
          <div style="display:flex;flex-direction:column;gap:6px">
            <div style="font-weight:700">${u.name || "-"}</div>
            <div style="opacity:.8;font-size:12px">
              <span class="pill ${
                role === "ADMIN" ? "pill-admin" : "pill-user"
              }">${role}</span>
            </div>
          </div>
        </td>
        <td style="word-break:break-all">${u.email || "-"}</td>
        <td>${u.phone || "-"}</td>
        <td>${fmtDate(u.createdAt)}</td>
        <td>${lockerText}</td>
        <td>
          <button class="btn admin-btn js-edit" data-id="${u._id}">Edit</button>
          <button class="btn admin-btn btn-danger js-delete" data-id="${
            u._id
          }">Delete</button>
        </td>
      </tr>`;
    })
    .join("");

  els.tbody.querySelectorAll(".js-edit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const user = allUsers.find((x) => String(x._id) === String(id));
      if (!user) return;

      els.editUserId.value = user._id;
      els.editName.value = user.name || "";
      els.editEmail.value = user.email || "";
      els.editPhone.value = user.phone || "";
      els.editLockerCode.value = user.lockerCode ?? "";

      openModal();
    });
  });

  els.tbody.querySelectorAll(".js-delete").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const user = allUsers.find((x) => String(x._id) === String(id));
      if (!user) return;

      if (isAdminUser(user)) {
        alert("Không thể xóa admin.");
        return;
      }

      const ok = confirm(
        `Xóa user "${user.name}"?\nTủ (nếu có) sẽ được trả về EMPTY.`
      );
      if (!ok) return;

      try {
        setStatus("Deleting...", "#ffd27a");
        const res = await apiFetch(`/admin/users/${id}`, { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

        setStatus("✅ Deleted user.", "#7CFF9B");
        await loadUsers();
      } catch (e) {
        setStatus(`❌ Delete failed: ${e.message}`, "#ff6b6b");
      }
    });
  });
}

async function loadUsers() {
  try {
    setStatus("Loading...", "#ffd27a");

    const res = await apiFetch("/admin/users", { method: "GET" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

    allUsers = Array.isArray(data.users) ? data.users : [];
    setStatus(`Loaded ${allUsers.length} users.`, "#7CFF9B");
    applySearch();
  } catch (e) {
    setStatus(`❌ Load failed: ${e.message}`, "#ff6b6b");
  }
}

function applySearch() {
  const q = String(els.search?.value || "")
    .trim()
    .toLowerCase();
  if (!q) return render(allUsers);

  const filtered = allUsers.filter((u) => {
    const name = String(u.name || "").toLowerCase();
    const email = String(u.email || "").toLowerCase();
    const phone = String(u.phone || "").toLowerCase();
    return name.includes(q) || email.includes(q) || phone.includes(q);
  });
  render(filtered);
}

async function saveEdit() {
  const id = els.editUserId.value;
  if (!id) return;

  const payload = {
    name: els.editName.value.trim(),
    email: els.editEmail.value.trim(),
    phone: els.editPhone.value.trim(),
    lockerCode: els.editLockerCode.value.trim(),
  };

  try {
    setModalStatus("Saving...", "#ffd27a");

    const res = await apiFetch(`/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

    setModalStatus("✅ Saved.", "#7CFF9B");
    await loadUsers();
    setTimeout(closeModal, 350);
  } catch (e) {
    setModalStatus(`❌ Save failed: ${e.message}`, "#ff6b6b");
  }
}

function bind() {
  els.refresh?.addEventListener("click", loadUsers);
  els.search?.addEventListener("input", applySearch);

  els.closeModal?.addEventListener("click", closeModal);
  els.cancel?.addEventListener("click", closeModal);
  els.save?.addEventListener("click", saveEdit);

  els.logout?.addEventListener("click", () => {
    clearAuth();
    location.href = "./logon.html";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bind();
  loadUsers();
});
