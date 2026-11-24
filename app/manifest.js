// Manifeste : permet d'installer l'appli (Edge, Chrome, téléphone) comme une application
export default function manifest() {
  return {
    name: "Études IA — Master UiT",
    short_name: "Études IA",
    description: "Corpus du master, fiches, citations et révisions",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#003349",
    lang: "fr",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
