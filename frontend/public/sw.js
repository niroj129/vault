/* Service worker: shows Web Push notifications for new messages and opens
   the right chat when one is tapped. No offline caching — the site is live
   data, so every request goes to the network as usual. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() }; }
  const url = data.url || "/messages";
  event.waitUntil((async () => {
    // skip the popup when the chat is already open and focused
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (wins.some((w) => w.focused && new URL(w.url).pathname + new URL(w.url).search === url)) return;
    await self.registration.showNotification(data.title || "New message", {
      body: data.body || "",
      tag: data.tag || url,
      renotify: true,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/messages";
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) {
        await w.focus();
        return w.navigate(url);
      }
    }
    return self.clients.openWindow(url);
  })());
});

self.addEventListener("fetch", () => {});
