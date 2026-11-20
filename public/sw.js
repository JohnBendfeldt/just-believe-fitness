/**
 * Just Believe Fitness — Zero-Trap Network-Only Service Worker for Play Store TWA.
 *
 * Intentionally does NOT cache HTML or JS bundles so users always receive fresh
 * deployments automatically without ever clearing site data or losing localStorage.
 * Exists solely to satisfy Android TWA / PWABuilder quality checks and show a clean
 * dark offline screen instead of Chrome's dinosaur page when launched with no network.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;

  event.respondWith(
    fetch(event.request).catch(
      () =>
        new Response(
          `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Just Believe Fitness — Offline</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b0e14; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif; padding: 24px; text-align: center; }
    main { max-width: 420px; background: #141a24; border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 24px; }
    h1 { margin: 0 0 10px; font-size: 1.3rem; }
    p { margin: 0 0 18px; color: #94a3b8; font-size: 0.92rem; line-height: 1.5; }
    button { background: #f97316; color: #140700; border: none; border-radius: 10px; padding: 10px 18px; font-weight: 700; font-size: 0.92rem; cursor: pointer; }
  </style>
</head>
<body>
  <main>
    <h1>You&apos;re Offline</h1>
    <p>Reconnect to Wi-Fi or mobile data to load Just Believe Fitness. Your saved rides and profile stay safely stored on this device.</p>
    <button onclick="location.reload()">Try Again</button>
  </main>
</body>
</html>`,
          {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          }
        )
    )
  );
});
