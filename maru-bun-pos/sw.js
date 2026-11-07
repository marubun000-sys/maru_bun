// Service worker for the customer QR page: lets the page be installed and shows phone notifications even when it is closed.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* network only – nothing is cached, so the menu is always fresh */ });

self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'මරු Bun';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '', icon: 'assets/icon-192.png', badge: 'assets/icon-192.png', tag: d.tag || 'mb-qr', renotify: true,
    vibrate: [300, 150, 300, 150, 500], requireInteraction: d.kind === 'ready', data: { url: d.url || 'order.html' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || 'order.html', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if (c.url.startsWith(url.split('#')[0]) && 'focus' in c) return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
