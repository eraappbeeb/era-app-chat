importScripts('https://www.gstatic.com/firebasejs/13.4.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/13.4.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDyebyyvUAroJfgMd-1NL3c0-5FhiDRE-I',
  authDomain: 'eraapp-659d3.firebaseapp.com',
  projectId: 'eraapp-659d3',
  storageBucket: 'eraapp-659d3.firebasestorage.app',
  messagingSenderId: '990243143431',
  appId: '1:990243143431:web:e3759ac9bc6dea5fb88fa2',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || payload?.data?.title || 'EraApp';
  const body = payload?.notification?.body || payload?.data?.body || 'New message';
  const chatId = payload?.data?.chatId || '';

  self.registration.showNotification(title, {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: {
      ...(payload?.data || {}),
      chatId,
    },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const chatId = event.notification?.data?.chatId;
  const targetUrl = chatId ? `/chat/${encodeURIComponent(chatId)}` : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if ('focus' in client) {
          client.postMessage({ type: 'OPEN_CHAT', chatId: chatId || null });
          if ('navigate' in client && client.url !== new URL(targetUrl, self.location.origin).href) {
            return client
              .navigate(targetUrl)
              .then((navigatedClient) => (navigatedClient || client).focus())
              .catch(() => client.focus());
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
