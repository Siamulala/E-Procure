const API_BASE_URL = (process.env.REACT_APP_ALWEN_API_URL || "").replace(/\/$/, "");

export function isAlwenApiConfigured() {
  return Boolean(API_BASE_URL);
}

export async function alwenLogin(email, password) {
  if (!API_BASE_URL) throw new Error("The Alwen API URL is not configured.");
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.detail || "Unable to sign in.");
  return result;
}

export async function alwenApiRequest(path, options = {}) {
  if (!API_BASE_URL) throw new Error("The Alwen API URL is not configured.");
  const token = sessionStorage.getItem("alwenApiToken");
  if (!token) throw new Error("Your Alwen API session has expired. Please sign in again.");

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (response.status === 401) {
    window.dispatchEvent(new Event("alwen:session-expired"));
  }
  if (response.status === 204) return null;
  const result = await response.json();
  if (!response.ok) throw new Error(result.detail || "The Alwen API request failed.");
  return result;
}

export async function alwenApiDownload(path, filename) {
  if (!API_BASE_URL) throw new Error("The Alwen API URL is not configured.");
  const token = sessionStorage.getItem("alwenApiToken");
  if (!token) throw new Error("Your Alwen API session has expired. Please sign in again.");

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (response.status === 401) {
    window.dispatchEvent(new Event("alwen:session-expired"));
  }
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.detail || "Unable to export the report.");
  }

  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function alwenApiUpload(path, file, fields = {}) {
  if (!API_BASE_URL) throw new Error("The Alwen API URL is not configured.");
  const token = sessionStorage.getItem("alwenApiToken");
  if (!token) throw new Error("Your Alwen API session has expired. Please sign in again.");

  const form = new FormData();
  form.append("file", file);
  const query = new URLSearchParams(fields).toString();
  const response = await fetch(`${API_BASE_URL}${path}${query ? `?${query}` : ""}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  if (response.status === 401) {
    window.dispatchEvent(new Event("alwen:session-expired"));
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.detail || "The file upload failed.");
  return result;
}
