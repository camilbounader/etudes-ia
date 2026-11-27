import { storeBuffer } from "@/lib/fileStore";
import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q, vec } from "@/lib/db";
import { mainTextFromHtml } from "@/lib/canvas";
import { detectMetadata } from "@/lib/metadata";
import { harvardInText, harvardReference } from "@/lib/harvard";
import { chunkPage, chunkKind } from "@/lib/chunking";
import { embedTexts } from "@/lib/gemini";
import { findDoi, openAccessPdf } from "@/lib/refLookup";

export const maxDuration = 120;

// POST { chapterId, url, title } : suit un lien d'une page Canvas.
// - PDF : copié dans Vercel Blob, le navigateur l'importe ensuite comme un PDF
// - page web : texte principal importé comme document « web »
export async function POST(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { chapterId, url, title } = await request.json();
  const key = `web:${url}`;
  try {
    const exists = await q(`select id from documents where canvas_page_url = $1`, [key]);
    if (exists.length) return Response.json({ ok: true, skipped: "déjà importé" });

    // Lien vers une publication : on cherche une version gratuite du texte intégral
    const PAYWALL = /proquest\.com|ebookcentral|jstor\.org|methods\.sagepub|sk\.sagepub|tandfonline|sciencedirect|onlinelibrary\.wiley|link\.springer|oup\.com|cambridge\.org\/core|emerald\.com|routledge\.com/i;
    let target = url;
    const doi = findDoi(decodeURIComponent(url));
    if (doi) {
      const pdf = await openAccessPdf(doi);
      if (pdf) target = pdf;
      else
        return Response.json({ ok: true, paywalled: true, skipped: `pas de version gratuite (DOI ${doi}) : télécharge le PDF via la bibliothèque UiT (connexion Feide), puis dépose-le dans ce chapitre` });
    } else if (PAYWALL.test(url)) {
      return Response.json({ ok: true, paywalled: true, skipped: "accès réservé : ouvre le lien connecté à la bibliothèque UiT (Feide), télécharge le PDF ou le chapitre, puis dépose-le dans ce chapitre" });
    }

    const res = await fetch(target, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (etudes-ia; usage personnel)", Accept: "text/html,application/pdf;q=0.9,*/*;q=0.8" },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return Response.json({ ok: true, skipped: `site inaccessible (${res.status})` });
    const type = res.headers.get("content-type") || "";

    if (/pdf/i.test(type) || /\.pdf($|\?)/i.test(res.url)) {
      const buf = Buffer.from(await res.arrayBuffer());
      const name = (decodeURIComponent(res.url.split("/").pop().split("?")[0]) || "document") .replace(/\.pdf$/i, "") + ".pdf";
      const stored = await storeBuffer(buf, name, "application/pdf");
      return Response.json({ ok: true, pdf: true, blobUrl: stored.url, driveId: stored.id, name });
    }
    if (!/html/i.test(type)) return Response.json({ ok: true, skipped: `type non pris en charge (${type.split(";")[0]})` });

    const text = mainTextFromHtml(await res.text());
    if (text.length < 400) return Response.json({ ok: true, skipped: "page trop courte, protégée ou générée en JavaScript" });

    const det = await detectMetadata({ title, printedRange: "", firstPagesText: text.slice(0, 6000) });
    const metadata = { ...det.metadata, type: det.metadata.type === "article" ? "article" : "web", url: res.url };
    metadata.accessed = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    if (!metadata.title) metadata.title = title;
    const intext = metadata.authors?.length || metadata.year ? harvardInText(metadata) : title;
    const reference = harvardReference(metadata);

    // sections d'environ 3 000 caractères = « pages »
    const sections = [];
    let cur = "";
    for (const para of text.split(/\n+/)) {
      if (cur.length + para.length > 3000 && cur) {
        sections.push(cur);
        cur = "";
      }
      cur += (cur ? "\n" : "") + para;
    }
    if (cur) sections.push(cur);

    const doc = (
      await q(
        `insert into documents (chapter_id, title, kind, blob_url, page_count, metadata, intext, reference, status, canvas_page_url)
         values ($1, $2, 'web', $3, $4, $5, $6, $7, 'ready', $8) returning id`,
        [chapterId, String(metadata.title).slice(0, 300), res.url, sections.length, JSON.stringify(metadata), intext, reference, key]
      )
    )[0];
    await q(
      `insert into pages (document_id, pdf_page, printed_page, text)
       select $1, a.n, null, a.t from unnest($2::int[], $3::text[]) as a(n, t)`,
      [doc.id, sections.map((_, i) => i + 1), sections]
    );
    const chunks = [];
    sections.forEach((s, i) => chunkPage(s).forEach((c) => chunks.push({ n: i + 1, c })));
    if (chunks.length) {
      const vectors = await embedTexts(chunks.map((c) => c.c));
      await q(
        `insert into chunks (document_id, pdf_page, printed_page, content, embedding, kind)
         select $1, a.n, null, a.c, a.e::vector, a.k from unnest($2::int[], $3::text[], $4::text[], $5::text[]) as a(n, c, e, k)`,
        [doc.id, chunks.map((c) => c.n), chunks.map((c) => c.c), vectors.map(vec), chunks.map((c) => chunkKind(c.c))]
      );
    }
    return Response.json({ ok: true, id: doc.id, chunks: chunks.length, intext });
  } catch (err) {
    return Response.json({ ok: true, skipped: `échec : ${String(err.message || err).slice(0, 120)}` });
  }
}
