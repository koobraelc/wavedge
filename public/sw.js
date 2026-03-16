// Wavedge Service Worker — handles push notifications

self.addEventListener("push", function (event) {
  if (!event.data) return;

  var data;
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: "Wavedge Alert", body: event.data.text() };
  }

  var options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || "/icons/badge-72.png",
    data: data.data || {},
    vibrate: [200, 100, 200],
    tag: "wavedge-alert-" + (data.data && data.data.tokenSymbol || "general"),
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "Wavedge Alert", options)
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  var url = "/dashboard";
  if (event.notification.data && event.notification.data.url) {
    url = event.notification.data.url;
  }

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windowClients) {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url.indexOf(url) !== -1 && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
