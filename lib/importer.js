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

// ---------- PowerPoint (.pptx), avec ou sans commentaire audio ----------
import { parsePptx } from "@/lib/pptxParse";

export async function importPptx({ file, name, chapterId, blobUrl, canvasFileId, say = () => {}, transcribe = true }) {
  name = name || file.name;
  let createdId = null;
  try {
    const JSZip = (await import("jszip")).default;
    say(`${name} : lecture du PowerPoint…`);
    const zip = await JSZip.loadAsync(file);
    const slides = await parsePptx(zip);
    const withAudio = slides.filter((s) => s.audio).length;
    say(`${name} : ${slides.length} diapos${withAudio ? `, ${withAudio} avec commentaire audio` : ""}`);

    if (!blobUrl) {
      say(`${name} : envoi du fichier…`);
      blobUrl = (await upload(name, file, { access: "public", handleUploadUrl: "/api/blob-upload", multipart: file.size > 8 * 1024 * 1024 })).url;
    }

    // commentaire audio de chaque diapo -> texte (Gemini), 3 à la fois
    if (transcribe && withAudio) {
      let done = 0;
      const queue = slides.map((s, i) => ({ s, i })).filter((x) => x.s.audio);
      const worker = async () => {
        while (queue.length) {
          const { s, i } = queue.shift();
          try {
            const data = await zip.file(s.audio).async("blob");
            const ext = s.audio.split(".").pop();
            const up = await upload(`tmp/diapo-${i + 1}.${ext}`, data, { access: "public", handleUploadUrl: "/api/blob-upload", multipart: data.size > 8 * 1024 * 1024 });
            const r = await api("/api/media-transcribe", { method: "POST", body: { blobUrl: up.url, name: `diapo-${i + 1}.${ext}`, mode: "slide" } });
            s.spoken = r.text || "";
          } catch (e) {
            s.spoken = "";
            say(`⚠ ${name} : commentaire de la diapo ${i + 1} non transcrit (${e.message})`);
          }
          say(`${name} : commentaires audio transcrits ${++done} / ${withAudio}`);
        }
      };
      await Promise.all([worker(), worker(), worker()]);
    }

    const pages = slides.map((s, i) =>
      [`Diapo ${i + 1}`, s.text, s.notes && `Notes de l'enseignant : ${s.notes}`, s.spoken && `Commentaire oral : ${s.spoken}`].filter(Boolean).join("\n\n")
    );
    const created = await api("/api/documents", {
      method: "POST",
      body: {
        chapterId: Number(chapterId),
        title: name.replace(/\.(pptx|ppsx|pptm|ppsm|potx|ppt)$/i, ""),
        kind: "slides",
        blobUrl,
        pageCount: pages.length,
        offset: null,
        confidence: 0,
        canvasFileId: canvasFileId || null,
        firstPagesText: pages.slice(0, 3).join("\n\n"),
      },
    });
    createdId = created.id;
    for (let i = 0; i < pages.length; i += BATCH) {
      say(`${name} : indexation des diapos ${i + 1} à ${Math.min(i + BATCH, pages.length)} / ${pages.length}`);
      await api(`/api/documents/${created.id}/pages`, {
        method: "POST",
        body: { pages: pages.slice(i, i + BATCH).map((text, j) => ({ pdfPage: i + j + 1, printedPage: null, text })) },
      });
    }
    await api(`/api/documents/${created.id}`, { method: "PATCH", body: { status: "ready" } });
    say(`✓ ${name} : ${pages.length} diapos${withAudio ? " avec leur commentaire oral" : ""} (citées « diapo N »)`);
    return { ok: true, id: created.id };
  } catch (e) {
    say(`✗ ${name} : ${e.message}`);
    if (createdId) await api(`/api/documents/${createdId}`, { method: "DELETE" }).catch(() => {});
    return { ok: false, error: e.message };
  }
}

// ---------- Enregistrement audio ou vidéo (cours, podcast…) ----------
export async function importMedia({ file, name, chapterId, blobUrl, say = () => {} }) {
  name = name || file.name;
  try {
    let up = { url: blobUrl };
    if (!blobUrl) {
      say(`${name} : envoi du fichier (${Math.round(file.size / 1e6)} Mo)…`);
      up = await upload(`media/${name}`, file, { access: "public", handleUploadUrl: "/api/blob-upload", multipart: file.size > 8 * 1024 * 1024 });
    }
    say(`${name} : transcription par Gemini (1 à 5 min)…`);
    const { text } = await api("/api/media-transcribe", { method: "POST", body: { blobUrl: up.url, name, mode: "media", keep: true } });
    const created = await api("/api/documents", {
      method: "POST",
      body: { chapterId: Number(chapterId), title: name.replace(/\.[a-z0-9]+$/i, ""), kind: "video", blobUrl: up.url, pageCount: 1, offset: null, confidence: 0 },
    });
    const r = await api(`/api/documents/${created.id}/transcript`, { method: "POST", body: { text } });
    say(`✓ ${name} : transcrit (${r.chunks} extraits${r.hasTimestamps ? " avec minutage" : ""})`);
    return { ok: true, id: created.id };
  } catch (e) {
    say(`✗ ${name} : ${e.message}`);
    return { ok: false, error: e.message };
  }
}

// ---------- N'importe quel fichier : choisit le bon import ----------
export const IMPORT_ACCEPT = ".pdf,.pptx,.ppsx,.pptm,.ppsm,.potx,.docx,.png,.jpg,.jpeg,.webp,.mp3,.m4a,.wav,.aac,.mp4,.mov,.webm";
export async function importAny({ file, name, chapterId, kind = "reading", blobUrl, canvasFileId, say = () => {} }) {
  name = name || file.name;
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "pdf") return importPdf({ source: file, name, chapterId, kind, blobUrl, canvasFileId, say });
  // .ppsx (diaporama), .pptm, .potx : même format que .pptx
  if (["pptx", "ppsx", "pptm", "ppsm", "potx"].includes(ext)) return importPptx({ file, name, chapterId, blobUrl, canvasFileId, say });
  if (ext === "ppt" || ext === "pps") {
    say(`✗ ${name} : ancien format PowerPoint (.ppt / .pps). Ouvre-le dans PowerPoint et enregistre-le en .pptx, puis réimporte-le.`);
    return { ok: false };
  }
  if (["mp3", "m4a", "wav", "aac", "mp4", "mov", "webm", "m4v"].includes(ext)) return importMedia({ file, name, chapterId, blobUrl, say });
  if (["png", "jpg", "jpeg", "webp", "docx"].includes(ext)) {
    const f = file.name ? file : new File([file], name);
    return importScreens({ file: f, chapterId, say });
  }
  say(`✗ ${name} : format non pris en charge`);
  return { ok: false };
}
