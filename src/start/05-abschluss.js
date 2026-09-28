  if ("serviceWorker" in navigator) {
    try {
      navigator.serviceWorker.getRegistrations()
        .then(function (regs) { regs.forEach(function (r) { r.unregister(); }); })
        .catch(function () {});
    } catch (e) { /* egal */ }
    try {
      if (window.caches && caches.keys) {
        caches.keys().then(function (keys) { keys.forEach(function (k) { caches.delete(k); }); }).catch(function () {});
      }
    } catch (e) { /* egal */ }
  }
