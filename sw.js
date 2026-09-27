// FlashMind Service Worker - Push Notifications v2
var SW_VERSION = 2;

self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', function(event) {
  var title = 'FlashMind';
  var body = 'Hom nay ban chua hoc! Vao on tap ngay nhe.';
  var url = '/';

  if (event.data) {
    try {
      var payload = event.data.json();
      title = payload.title || title;
      body = payload.body || body;
      url = payload.url || url;
    } catch(e) {
      try { body = event.data.text() || body; } catch(e2) {}
    }
  }

  var options = {
    body: body,
    icon: '/apple-touch-icon.png',
    badge: '/apple-touch-icon.png',
    data: { url: url }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf('ENGLISH') >= 0) {
          list[i].focus();
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});
