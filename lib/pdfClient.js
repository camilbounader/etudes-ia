// Lecture des PDF dans le navigateur (pdf.js), sans passer par le serveur.
// pdf.js est copié dans /public/pdfjs à l'installation (scripts/copy-pdfjs.mjs)
// et chargé à la demande, hors du bundle Next.js.

let _pdfjs;
export async function loadPdfjs() {
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

// Image PNG d'une page de PDF (pour montrer une figure dans une fiche)
const _cache = new Map();
export async function renderPdfPage(url, page, scale = 1.6) {
  const key = `${url}#${page}`;
  if (_cache.has(key)) return _cache.get(key);
  const job = (async () => {
    const pdfjs = await loadPdfjs();
    let buf;
    const { driveIdOf, readFile } = await import("@/lib/fileClient");
    if (driveIdOf(url)) buf = await (await readFile(driveIdOf(url))).arrayBuffer();
    else {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`PDF inaccessible (${res.status})`);
      buf = await res.arrayBuffer();
    }
    const task = pdfjs.getDocument({ data: new Uint8Array(buf) });
    const doc = await task.promise;
    const p = await doc.getPage(page);
    const vp = p.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    await p.render({ canvasContext: canvas.getContext("2d"), viewport: vp, canvas }).promise;
    const dataUrl = canvas.toDataURL("image/png");
    const bin = atob(dataUrl.split(",")[1]);
    const data = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
    try {
      await task.destroy();
    } catch {}
    return { dataUrl, data, width: canvas.width, height: canvas.height };
  })();
  _cache.set(key, job);
  job.catch(() => _cache.delete(key));
  return job;
}

// Toutes les images de figures d'une fiche, pour l'export Word
export async function figureImages(sources) {
  const images = new Map();
  for (const s of sources) {
    const key = `${s.url}#${s.page}`;
    if (images.has(key)) continue;
    try {
      images.set(key, await renderPdfPage(s.url, s.page));
    } catch {}
  }
  return images;
}
