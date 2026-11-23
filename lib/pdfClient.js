// Lecture des PDF dans le navigateur (pdf.js), sans passer par le serveur.
// pdf.js est copié dans /public/pdfjs à l'installation (scripts/copy-pdfjs.mjs)
// et chargé à la demande, hors du bundle Next.js.

let _pdfjs;
async function loadPdfjs() {
  if (_pdfjs) return _pdfjs;
  const importer = new Function("u", "return import(u)");
  const pdfjs = await importer("/pdfjs/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  _pdfjs = pdfjs;
  return pdfjs;
}

// Renvoie [{ height, items: [{ str, y }], text }] : une entrée par page.
export async function extractPdf(file, onProgress) {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = [];
    let text = "";
    for (const it of tc.items) {
      if (!("str" in it)) continue;
      items.push({ str: it.str, y: vp.height - it.transform[5] });
      text += it.str + (it.hasEOL ? "\n" : "");
    }
    pages.push({ height: vp.height, items, text });
    page.cleanup();
    onProgress?.(i, doc.numPages);
  }
  // pdf.js 6 : la fermeture se fait sur la tâche de chargement
  try {
    await task.destroy();
  } catch {}
  return pages;
}
