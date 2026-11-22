// Copie pdf.js dans /public/pdfjs pour qu'il soit chargé par le navigateur
// sans passer par le bundler de Next.js.
import { mkdirSync, copyFileSync, existsSync } from "fs";

const src = "node_modules/pdfjs-dist/build";
const dest = "public/pdfjs";
mkdirSync(dest, { recursive: true });

const files = [
  ["pdf.min.mjs", "pdf.mjs"],
  ["pdf.worker.min.mjs", "pdf.worker.mjs"],
];
for (const [min, full] of files) {
  const from = existsSync(`${src}/${min}`) ? `${src}/${min}` : `${src}/${full}`;
  if (!existsSync(from)) {
    console.warn(`[copy-pdfjs] introuvable : ${src}/${min}`);
    continue;
  }
  copyFileSync(from, `${dest}/${min}`);
  console.log(`[copy-pdfjs] ${from} -> ${dest}/${min}`);
}
