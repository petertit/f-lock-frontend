//http.js
import { API_BASE } from "./api.js";

export function getToken() {
  return sessionStorage.getItem("token");
}

export function clearAuth() {
  sessionStorage.removeItem("token");
  sessionStorage.removeItem("user");
}

export async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const token = getToken();

  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    clearAuth();

    if (!location.pathname.toLowerCase().includes("logon")) {
      location.href = "./logon.html";
    }
    throw new Error("Unauthorized (token expired)");
  }

  return res;
}
