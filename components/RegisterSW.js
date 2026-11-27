"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/clientErrors";

export default function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    // erreurs JavaScript non rattrapées : enregistrées pour diagnostic
    const onError = (e) => reportClientError(e.error || e.message, { where: "window" });
    const onRejection = (e) => reportClientError(e.reason, { where: "promesse" });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
