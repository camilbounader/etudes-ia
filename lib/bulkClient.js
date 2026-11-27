"use client";

// Import en vrac (côté navigateur) : analyse rapide de chaque fichier,
// puis import des fiches Word (notes perso).
import { tryStoreFile } from "@/lib/fileClient";
import { api } from "@/lib/api";

let _pdfjs;
async function pdfjs() {
  if (_pdfjs) return _pdfjs;
  const importer = new Function("u", "return import(u)");
  _pdfjs = await importer("/pdfjs/pdf.min.mjs");
  _pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  return _pdfjs;
}

async function docxParts(file) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = (await zip.file("word/document.xml")?.async("string")) || "";
  const paragraphs = xml
    .split(/<\/w:p>/)
    .map((p) =>
      [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)]
        .map((m) => m[1])
        .join("")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .trim()
    )
    .filter(Boolean);
  const images = Object.keys(zip.files).filter((n) => /^word\/media\/.+\.(png|jpe?g|gif|bmp|webp)$/i.test(n)).length;
  return { paragraphs, images };
}

// Résumé d'un fichier pour le tri : type, taille, début du texte.
export async function analyzeFile(file) {
  const name = file.name;
  const path = file.webkitRelativePath || name;
  const lower = name.toLowerCase();
  const base = { path, name, size: file.size };
  try {
    if (lower.endsWith(".pdf")) {
      const lib = await pdfjs();
      const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
      const doc = await task.promise;
      let text = "";
      for (let i = 1; i <= Math.min(2, doc.numPages); i++) {
        const tc = await (await doc.getPage(i)).getTextContent();
        text += tc.items.map((it) => it.str || "").join(" ") + "\n";
      }
      const pages = doc.numPages;
      try {
        await task.destroy();
      } catch {}
      return { ...base, ext: "pdf", pages, textLength: text.trim().length, textSample: text.slice(0, 1500), imageCount: 0 };
    }
    if (/\.(docx|doc)$/.test(lower)) {
      const { paragraphs, images } = await docxParts(file);
      const text = paragraphs.join("\n");
      return { ...base, ext: "docx", pages: null, textLength: text.length, textSample: text.slice(0, 1500), imageCount: images };
    }
    if (/\.(pptx|ppsx|pptm|ppsm|potx)$/.test(lower)) return { ...base, ext: "pptx", pages: null, textLength: 1000, textSample: "", imageCount: 0 };
    if (/\.(mp3|m4a|wav|aac|mp4|mov|webm)$/.test(lower)) return { ...base, ext: "media", pages: null, textLength: 0, textSample: "", imageCount: 0 };
    if (/\.(png|jpe?g|webp)$/.test(lower)) {
      return { ...base, ext: "image", pages: 1, textLength: 0, textSample: "", imageCount: 1 };
    }
    return { ...base, ext: "other", unsupported: "format non pris en charge" };
  } catch (e) {
    return {
      ...base,
      ext: lower.split(".").pop(),
      unsupported: lower.endsWith(".doc")
        ? "ancien format .doc : ouvre-le dans Word et enregistre-le en .docx"
        : `illisible (${e.message})`,
    };
  }
}

// Fiche Word (Gemini ou perso) -> document « notes », découpé en sections.
export async function importNotes({ file, chapterId, say = () => {} }) {
  const name = file.name;
  let createdId = null;
  try {
    say(`${name} : lecture de la fiche…`);
    const { paragraphs } = await docxParts(file);
    if (!paragraphs.length) throw new Error("aucun texte dans ce Word");
    const sections = [];
    let cur = "";
    for (const p of paragraphs) {
      if (cur.length + p.length > 3500 && cur) {
        sections.push(cur);
        cur = "";
      }
      cur += (cur ? "\n" : "") + p;
    }
    if (cur) sections.push(cur);

    const blob = { url: (await tryStoreFile(file, name.replace(/\.doc$/i, ".docx")))?.url || null };
    const created = await api("/api/documents", {
      method: "POST",
      body: {
        chapterId: Number(chapterId),
        title: (paragraphs[0] || name).slice(0, 150),
        kind: "notes",
        blobUrl: blob.url,
        pageCount: sections.length,
        offset: null,
        confidence: 0,
      },
    });
    createdId = created.id;
    await api(`/api/documents/${created.id}/pages`, {
      method: "POST",
      body: { pages: sections.map((text, i) => ({ pdfPage: i + 1, printedPage: null, text })) },
    });
    await api(`/api/documents/${created.id}`, { method: "PATCH", body: { status: "ready" } });
    say(`✓ ${name} : fiche importée (${sections.length} section(s))`);
    return { ok: true };
  } catch (e) {
    say(`✗ ${name} : ${e.message}`);
    if (createdId) await api(`/api/documents/${createdId}`, { method: "DELETE" }).catch(() => {});
    return { ok: false };
  }
}
