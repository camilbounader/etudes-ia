"use client";

// Import d'un PDF (côté navigateur), commun à l'import manuel et à Canvas :
// lecture du texte, pages imprimées, référence, passages et embeddings.
import { upload } from "@vercel/blob/client";
import { api } from "@/lib/api";
import { extractPdf } from "@/lib/pdfClient";
import { detectPagination } from "@/lib/pagination";

const BATCH = 12; // pages envoyées par requête

// source : un File (import manuel) ou un Blob (téléchargé depuis Canvas)
// blobUrl : si déjà stocké (Canvas), on saute l'envoi
export async function importPdf({ source, name, chapterId, kind = "reading", blobUrl, canvasFileId, say = () => {} }) {
  let createdId = null;
  try {
    if (!blobUrl) {
      say(`${name} : envoi du PDF…`);
      const blob = await upload(name, source, {
        access: "public",
        handleUploadUrl: "/api/blob-upload",
        multipart: source.size > 8 * 1024 * 1024,
      });
      blobUrl = blob.url;
    }

    say(`${name} : lecture du texte…`);
    const pages = await extractPdf(source);
    const pag = kind === "slides" ? { offset: null, confidence: 0, printed: pages.map(() => null) } : detectPagination(pages);
    const nums = pag.printed.filter(Boolean).map(Number);
    const printedRange = nums.length ? `${Math.min(...nums)}–${Math.max(...nums)}` : "";
    const textChars = pages.reduce((n, p) => n + p.text.trim().length, 0);
    if (textChars < 200) {
      say(`⚠ ${name} : presque aucun texte (PDF scanné ?). Lecture des images prévue à une étape suivante.`);
    }

    say(`${name} : identification de la référence…`);
    const created = await api("/api/documents", {
      method: "POST",
      body: {
        chapterId: Number(chapterId),
        title: name.replace(/\.pdf$/i, ""),
        kind,
        blobUrl,
        pageCount: pages.length,
        offset: pag.offset,
        confidence: pag.confidence,
        printedRange,
        canvasFileId: canvasFileId || null,
        firstPagesText: pages.slice(0, 3).map((p) => p.text).join("\n\n"),
      },
    });
    createdId = created.id;

    for (let i = 0; i < pages.length; i += BATCH) {
      say(`${name} : indexation des pages ${i + 1} à ${Math.min(i + BATCH, pages.length)} / ${pages.length}`);
      await api(`/api/documents/${created.id}/pages`, {
        method: "POST",
        body: {
          pages: pages.slice(i, i + BATCH).map((p, j) => ({
            pdfPage: i + j + 1,
            printedPage: pag.printed[i + j],
            text: p.text,
          })),
        },
      });
    }
    await api(`/api/documents/${created.id}`, { method: "PATCH", body: { status: "ready" } });
    say(`✓ ${name} : (${created.intext}) ${printedRange ? "p. " + printedRange : "sans numérotation"}`);
    return { ok: true, id: created.id };
  } catch (e) {
    say(`✗ ${name} : ${e.message}`);
    if (createdId) {
      await api(`/api/documents/${createdId}`, { method: "DELETE" }).catch(() => {});
      say(`  (document incomplet supprimé : réimporte ce fichier)`);
    }
    return { ok: false, error: e.message };
  }
}
