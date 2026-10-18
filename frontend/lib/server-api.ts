import "server-only";
import { headers } from "next/headers";

// Server components reach Django directly and tell it which site (tenant) the
// visitor is on via X-Forwarded-Host.
const SERVER_BASE = process.env.INTERNAL_API_URL || "http://127.0.0.1:8000";

async function requestHost() {
  const h = await headers();
  return h.get("x-forwarded-host") || h.get("host") || "localhost";
}

/** Public base URL of the current site, e.g. https://luckystar.com */
export async function siteUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") ||
    (host.startsWith("localhost") || host.includes(".localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Server-side fetch with ISR caching (public data), cached per site. */
export async function getJSON<T>(path: string, { revalidate = 60 }: { revalidate?: number } = {}): Promise<T> {
  const host = await requestHost();
  const sep = path.includes("?") ? "&" : "?";
  // the host in the URL keeps Next's fetch cache separate per tenant
  const res = await fetch(`${SERVER_BASE}/api${path}${sep}_site=${encodeURIComponent(host)}`, {
    headers: { "X-Forwarded-Host": host },
    next: { revalidate },
  });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

/** Server-side fetch that never throws (returns fallback). */
export async function getJSONSafe<T>(path: string, fallback: T, opts: { revalidate?: number } = {}): Promise<T> {
  try {
    return await getJSON<T>(path, opts);
  } catch {
    return fallback;
  }
}
