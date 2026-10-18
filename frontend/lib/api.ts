// The browser always talks to the API on its own origin (/api, /media, /ws).
// Each casino (tenant) is identified by the domain it is served on, so a
// relative URL keeps every request on the right site. In development Next.js
// rewrites /api and /media to Django (see next.config.mjs).
export const API_BASE = "";

const api = (path: string) => `${API_BASE}/api${path}`;

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/** Client-side public fetch. */
export async function getJSON<T = unknown>(path: string): Promise<T> {
  const res = await fetch(api(path));
  if (!res.ok) throw new ApiError(`GET ${path} -> ${res.status}`, res.status, null);
  return res.json() as Promise<T>;
}

/** Client-side public fetch that never throws (returns fallback). */
export async function getJSONSafe<T>(path: string, fallback: T): Promise<T> {
  try {
    return await getJSON<T>(path);
  } catch {
    return fallback;
  }
}

interface FetchOpts {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
  isForm?: boolean;
}

/** Client-side authenticated fetch. Throws ApiError with the best human message. */
export async function apiFetch<T = any>(path: string, { method = "GET", body, token, isForm }: FetchOpts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Token ${token}`;
  let payload: BodyInit | undefined;
  if (body !== undefined && body !== null) {
    if (body instanceof FormData) {
      // an empty FormData is an invalid multipart body (the server answers a blank 400), so send it as empty JSON
      if (body.keys().next().done) { headers["Content-Type"] = "application/json"; payload = "{}"; } else payload = body;
    } else if (isForm) payload = body as BodyInit;
    else {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
  }
  const res = await fetch(api(path), { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(firstError(data), res.status, data);
  return data as T;
}

/** Best human-readable message from a DRF error body. */
export function firstError(data: unknown): string {
  if (!data || typeof data !== "object") return "Something went wrong. Please try again.";
  const d = data as Record<string, unknown>;
  if (typeof d.detail === "string") return d.detail;
  for (const v of Object.values(d)) {
    if (typeof v === "string") return v;
    if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  }
  return "Something went wrong. Please try again.";
}

/** Field errors from a DRF 400 body, for react-hook-form setError. */
export function fieldErrors(e: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const data = e instanceof ApiError ? e.data : null;
  if (data && typeof data === "object") {
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (k === "detail") continue;
      if (typeof v === "string") out[k] = v;
      else if (Array.isArray(v) && typeof v[0] === "string") out[k] = v[0];
    }
  }
  return out;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");

/** Media is served from the site's own origin (/media/...). */
export function mediaUrl(src?: string | null): string {
  if (!src) return "";
  if (src.startsWith("http")) {
    // absolute URLs from the API point at the backend host; keep the path
    try { const u = new URL(src); if (u.pathname.startsWith("/media/")) return u.pathname; } catch {}
    return src;
  }
  return src.startsWith("/") ? src : `/${src}`;
}

/** Websocket URL for the messenger on this site. */
export function wsUrl(path: string): string {
  const { protocol, hostname, host, port } = window.location;
  const scheme = protocol === "https:" ? "wss:" : "ws:";
  // `next dev`/`next start` can't proxy websockets, so on :3000 connect to Django directly
  const target = port === "3000" ? `${hostname}:8000` : host;
  return `${scheme}//${target}${path}`;
}
