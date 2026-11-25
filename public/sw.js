// Service worker : appli installable + lecture hors ligne des pages déjà ouvertes.
// Stratégie « réseau d'abord » : en ligne, tout vient du serveur (toujours à jour) ;
// hors ligne, on ressert la dernière version enregistrée.
const CACHE = "etudes-v1";
const SKIP = ["/api/google", "/api/cron", "/api/login", "/api/blob-upload", "/login"];

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (SKIP.some((p) => url.pathname.startsWith(p))) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        // page jamais ouverte : on renvoie l'accueil si on l'a
        if (req.mode === "navigate") {
          const home = await caches.match("/");
          if (home) return home;
        }
        return new Response(JSON.stringify({ error: "Hors ligne : cette page n'a pas encore été ouverte avec une connexion." }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      })
  );
});
