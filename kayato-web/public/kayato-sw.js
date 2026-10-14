self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; }
  catch { payload = { message: event.data?.text() || 'You have a new KayaTo notification.' }; }
  event.waitUntil(self.registration.showNotification(payload.title || 'KayaTo', {
    body: payload.message || 'You have a new notification.',
    icon: '/brand/kayato-redlogo.svg',
    badge: '/brand/kayato-redlogo.svg',
    tag: payload.tag || 'kayato-notification',
    data: { url: payload.url || '/app' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || '/app', self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((client) => client.url.startsWith(self.location.origin));
    if (existing) return existing.navigate(destination).then(() => existing.focus());
    return clients.openWindow(destination);
  }));
});
