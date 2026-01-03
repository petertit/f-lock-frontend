// scripts/pass_lock.js (FINAL - matches pass_lock.html)

const API_BASE = "https://f-locker-backend.onrender.com";

function getToken() {
  return sessionStorage.getItem("token");
}

function getUser() {
  try {
    return JSON.parse(sessionStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

function getUserId(user) {
  return String(user?._id || user?.id || "");
}

async function postUpdate(body, token) {
  // ưu tiên /update vì routes backend của bạn mount trực tiếp "/update"
  // nhưng có fallback /auth/update cho trường hợp khác
  const paths = ["/update", "/auth/update"];

  let last = null;
  for (const p of paths) {
    try {
      const res = await fetch(`${API_BASE}${p}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));

      // nếu 404 thì thử path khác
      if (res.status === 404) continue;

      return { res, data, path: p };
    } catch (e) {
      last = e;
    }
  }
  throw last || new Error("Cannot reach backend update endpoint");
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("lockerRegisterForm");
  const input = document.getElementById("password");

  if (!form || !input) {
    console.error("Missing #lockerRegisterForm or #password");
    alert("❌ Thiếu form hoặc input (id không khớp).");
    return;
  }

  const token = getToken();
  const user = getUser();

  if (!token || !user) {
    alert("⚠️ Bạn cần đăng nhập trước!");
    location.href = "./logon.html";
    return;
  }

  // lockerId: tùy open.js bạn set key nào thì mình lấy key đó
  const lockerId =
    sessionStorage.getItem("locker_to_open") ||
    sessionStorage.getItem("selectedLocker") ||
    sessionStorage.getItem("lockerId") ||
    null;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const lockerCode = String(input.value || "").trim();
    if (!lockerCode) {
      alert("⚠️ Vui lòng nhập Locker Password!");
      return;
    }
    if (lockerCode.length < 4) {
      alert("⚠️ Mã tủ nên từ 4 ký tự trở lên.");
      return;
    }

    const userId = getUserId(user);
    if (!userId) {
      alert("❌ Không lấy được userId trong session. Vui lòng đăng nhập lại.");
      sessionStorage.removeItem("token");
      sessionStorage.removeItem("user");
      location.href = "./logon.html";
      return;
    }

    // payload update theo backend AuthController của bạn
    const payload = {
      id: userId,
      lockerCode,
      ...(lockerId ? { registeredLocker: String(lockerId) } : {}),
    };

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const { res, data } = await postUpdate(payload, token);

      if (res.status === 401) {
        sessionStorage.removeItem("token");
        sessionStorage.removeItem("user");
        alert("⚠️ Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.");
        location.href = "./logon.html";
        return;
      }

      if (!res.ok) {
        throw new Error(data?.error || data?.message || "Update failed");
      }

      if (data?.user) {
        sessionStorage.setItem("user", JSON.stringify(data.user));
      }

      alert("✅ Đăng ký lock-code thành công!");
      location.href = "./open.html";
    } catch (err) {
      console.error(err);
      alert("❌ Không đăng ký được lock-code: " + err.message);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
});
