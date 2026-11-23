import "./globals.css";
import Background from "@/components/Background";
import Header from "@/components/Header";

export const metadata = {
  title: "Études IA",
  description: "Corpus du master, citations et révisions",
  icons: { icon: "/brand/uit-logo.png" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body className="text-slate-900 antialiased min-h-screen">
        <Background />
        <Header />
        {children}
      </body>
    </html>
  );
}
