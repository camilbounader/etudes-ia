"use client";

// Envoie une erreur du navigateur au serveur (visible dans Paramètres → Erreurs récentes)
export function reportClientError(error, extra = {}) {
  try {
    const body = JSON.stringify({
      message: String(error?.message || error || "erreur inconnue").slice(0, 500),
      stack: String(error?.stack || "").slice(0, 2000),
      componentStack: String(extra.stack || "").slice(0, 1500),
      where: extra.where || "",
      url: typeof location !== "undefined" ? location.pathname + location.hash : "",
      ua: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : "",
      at: new Date().toISOString(),
    });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/client-error", new Blob([body], { type: "application/json" }));
    else fetch("/api/client-error", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch {}
}
