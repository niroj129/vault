"use client";

import { apiFetch } from "./api";

/* Web Push: ask permission, subscribe this browser, and send the
   subscription to the server (chat.push sends to it). */

export type PushState = "on" | "off" | "blocked" | "unsupported";

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator
    && "PushManager" in window && "Notification" in window;
}

export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return Promise.resolve(null);
  return navigator.serviceWorker.register("/sw.js").catch(() => null);
}

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = reg && await reg.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

export async function enablePush(token: string | null): Promise<PushState> {
  if (!pushSupported()) throw new Error("This browser can't show notifications.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notifications are blocked. Allow them in your browser's site settings.");
  const reg = await registerServiceWorker();
  if (!reg) throw new Error("Notifications couldn't start in this browser.");
  await navigator.serviceWorker.ready;
  const { key } = await apiFetch<{ key: string }>("/messenger/push/key/", { token });
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  await apiFetch("/messenger/push/subscribe/", { method: "POST", token, body: sub.toJSON() });
  return "on";
}

export async function disablePush(token: string | null): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = reg && await reg.pushManager.getSubscription();
  if (sub) {
    await apiFetch("/messenger/push/subscribe/", { method: "DELETE", token, body: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe();
  }
  return "off";
}
