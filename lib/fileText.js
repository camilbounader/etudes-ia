"use client";

import { api } from "@/lib/api";

// Fichiers joints (PDF, Word, texte, photos) -> texte, côté navigateur.
// Les photos et les Word remplis de captures sont lus par Gemini (OCR).
export const FILE_ACCEPT = ".pdf,.docx,.txt,.md,.csv,image/*";

export async function fileToText(file, onStatus) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    const { extractPdf } = await import("@/lib/pdfClient");
    const pages = await extractPdf(file, (i, n) => onStatus(`${file.name} : page ${i}/${n}`));
    return pages.map((p, i) => `[p. ${i + 1}]\n${p.text}`).join("\n\n");
  }
  if (name.endsWith(".docx")) {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(file);
    const xml = await zip.file("word/document.xml").async("string");
    const text = (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [])
      .map((p) => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, "")).join(""))
      .filter((t) => t.trim())
      .join("\n")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&apos;/g, "'").replace(/&quot;/g, '"');
    if (text.trim()) return text;
    // Word rempli de captures : on lit les images
    const { imagesFromDocx, toJpegBase64 } = await import("@/lib/imageClient");
    const imgs = await imagesFromDocx(file);
    const out = [];
    for (const [i, img] of imgs.entries()) {
      onStatus(`${file.name} : image ${i + 1}/${imgs.length}`);
      const r = await api("/api/ocr", { method: "POST", body: { image: await toJpegBase64(img), mode: "notes" } });
      out.push(r.text);
    }
    return out.join("\n\n");
  }
  if (file.type.startsWith("image/")) {
    const { toJpegBase64 } = await import("@/lib/imageClient");
    onStatus(`${file.name} : lecture de l'image…`);
    const r = await api("/api/ocr", { method: "POST", body: { image: await toJpegBase64(file), mode: "notes" } });
    return r.text;
  }
  return await file.text();
}

