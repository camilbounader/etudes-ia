// Service worker minimal : rend l'appli installable. Pas de cache hors ligne
// (les données viennent toujours du serveur, pour rester à jour).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
