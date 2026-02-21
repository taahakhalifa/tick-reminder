// Service Worker for Tick Reminder - handles push notifications

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'Tick Reminder', body: event.data.text() };
  }

  const title = data.title || 'Tick Reminder';
  const options = {
    body: data.body || 'Time to tick!',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'tick-reminder',
    renotify: true,
    data: { url: '/' },
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      if (clients.length > 0) {
        return clients[0].focus();
      }
      return self.clients.openWindow(event.notification.data?.url || '/');
    })
  );
});
