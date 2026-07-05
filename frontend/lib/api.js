export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// Server-side (Node) fetches use the internal address when provided, so SSR in
// the container reaches the backend directly. In the browser INTERNAL_API_URL is
// undefined, so it falls back to the public API_BASE. Media URLs always use the
// public API_BASE via mediaUrl().
const SERVER_BASE = process.env.INTERNAL_API_URL || API_BASE;

const api = (path, server = false) => `${server ? SERVER_BASE : API_BASE}/api${path}`;

/** Server-side fetch with ISR caching (public data). */
export async function getJSON(path, { revalidate = 60 } = {}) {
  const res = await fetch(api(path, true), { next: { revalidate } });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json();
}

/** Server-side fetch that never throws (returns fallback). */
export async function getJSONSafe(path, fallback = null, opts = {}) {
  try {
    return await getJSON(path, opts);
  } catch {
    return fallback;
  }
}

/** Client-side authenticated fetch. */
export async function apiFetch(path, { method = "GET", body, token, isForm } = {}) {
  const headers = {};
  if (token) headers["Authorization"] = `Token ${token}`;
  let payload = body;
  if (body && !isForm) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(api(path), { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.detail || "Request failed"),
    { status: res.status, data });
  return data;
}

/** Turn a possibly-relative media path into an absolute URL. */
export function mediaUrl(src) {
  if (!src) return "";
  if (src.startsWith("http")) return src;
  return `${API_BASE}${src.startsWith("/") ? "" : "/"}${src}`;
}
