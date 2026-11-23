import "./globals.css";
import Background from "@/components/Background";
import Header from "@/components/Header";
import { THEME_SCRIPT } from "@/lib/theme";

export const metadata = {
  title: "Études IA",
  description: "Corpus du master, citations et révisions",
  icons: { icon: "/brand/uit-logo.png" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* applique le thème avant l'affichage (pas d'éclair blanc le soir) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="text-slate-900 antialiased min-h-screen">
        <Background />
        <Header />
        {children}
      </body>
    </html>
  );
}
