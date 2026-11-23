"use client";

// Import d'un PDF (côté navigateur), commun à l'import manuel et à Canvas :
// lecture du texte, pages imprimées, référence, passages et embeddings.
import { upload } from "@vercel/blob/client";
import { api } from "@/lib/api";
import { extractPdf } from "@/lib/pdfClient";
import { detectPagination } from "@/lib/pagination";
import { imagesFromFile, toJpegBase64 } from "@/lib/imageClient";

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

// Import de captures d'écran (images ou Word de captures) : chaque image est
// lue par Gemini, puis devient une « page » du document (citée « capture N »).
export async function importScreens({ file, chapterId, say = () => {} }) {
  const name = file.name;
  let createdId = null;
  try {
    say(`${name} : envoi du fichier…`);
    const blob = await upload(name, file, { access: "public", handleUploadUrl: "/api/blob-upload" });

    const images = await imagesFromFile(file);
    if (!images.length) throw new Error("aucune image trouvée");
    const texts = [];
    for (let i = 0; i < images.length; i++) {
      say(`${name} : lecture de l'image ${i + 1} / ${images.length} par Gemini…`);
      const { text } = await api("/api/ocr", { method: "POST", body: { image: await toJpegBase64(images[i]) } });
      texts.push(text || "");
    }

    const created = await api("/api/documents", {
      method: "POST",
      body: {
        chapterId: Number(chapterId),
        title: name.replace(/\.(docx|png|jpe?g|webp)$/i, ""),
        kind: "screens",
        blobUrl: blob.url,
        pageCount: images.length,
        offset: null,
        confidence: 0,
      },
    });
    createdId = created.id;
    await api(`/api/documents/${created.id}/pages`, {
      method: "POST",
      body: { pages: texts.map((text, i) => ({ pdfPage: i + 1, printedPage: null, text })) },
    });
    await api(`/api/documents/${created.id}`, { method: "PATCH", body: { status: "ready" } });
    say(`✓ ${name} : ${images.length} image(s) lue(s)`);
    return { ok: true, id: created.id };
  } catch (e) {
    say(`✗ ${name} : ${e.message}`);
    if (createdId) await api(`/api/documents/${createdId}`, { method: "DELETE" }).catch(() => {});
    return { ok: false, error: e.message };
  }
}
