import "./globals.css";

export const metadata = {
  title: "Études IA",
  description: "Corpus du master, citations et révisions",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body className="bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
