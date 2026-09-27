// FlashMind Service Worker - Push Notifications
self.addEventListener('push', function(event) {
  var data = {title: 'FlashMind', body: 'Hom nay ban chua hoc!', icon: '/icon.svg', badge: '/icon.svg'};
  if (event.data) {
    try { data = Object.assign(data, event.data.json()); } catch(e) {}
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icon.svg',
      badge: data.badge || '/icon.svg',
      tag: 'flashmind-reminder',
      renotify: true,
      data: {url: data.url || '/'}
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';
  event.waitUntil(
    clients.matchAll({type: 'window', includeUncontrolled: true}).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf('flashmind') >= 0 || list[i].url.indexOf('ENGLISH') >= 0) {
          list[i].focus();
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});
