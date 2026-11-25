import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";
import { scopeInfo } from "@/lib/scope";
import { structureText } from "@/lib/structure";
import { deliverableBody, DELIVERABLE_NAMES } from "@/lib/deliverableHtml";

export const maxDuration = 300;

// Export « pack » d'un chapitre, module, cours ou du master : un seul fichier texte
// (Markdown) avec un prompt prêt pour Gemini / NotebookLM, le plan, les aperçus,
// les fiches, les livrables, mes travaux et, en option, le texte intégral du corpus
// avec ses numéros de page. Envoyé en flux (pas de limite de taille).

const PROMPT = (label) => `# Pack d'étude — ${label}

> **Mode d'emploi (à lire par l'assistant IA)**
> Tu es l'assistant d'étude de Camil, étudiant international en Master (UiT The Arctic University of Norway ; cours en anglais, il travaille en français).
> Ce fichier contient le plan de ses cours, les aperçus, les fiches de révision, les livrables d'apprentissage, ses propres réponses aux exercices
> et, s'il est inclus, le texte intégral des lectures. Dans le texte des lectures, chaque page commence par un repère comme [p. 47] (page imprimée),
> [diapo 3] ou [00:12:30] (vidéo).
> Règles : appuie-toi d'abord sur ce fichier ; cite en Harvard « (Auteur, année, p. X) » en utilisant la référence donnée en tête de chaque document
> et le repère de page juste avant le passage ; ne cite jamais une fiche ou un livrable comme une source ; signale ce qui vient d'ailleurs
> par « Hors corpus : ». Réponds en français sauf demande contraire.

`;

const strip = (html) =>
  String(html || "")
    .replace(/<h2>/g, "\n#### ")
    .replace(/<\/h2>/g, "\n")
    .replace(/<li>/g, "\n- ")
    .replace(/<tr>/g, "\n| ")
    .replace(/<\/t[dh]>/g, " | ")
    .replace(/<br>/g, "\n")
    .replace(/<\/p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const plainSegments = (segs) =>
  (segs || []).map((x) => x.text + (x.cites?.length ? ` (${x.cites.map((c) => c.label).join("; ")})` : "")).join("").trim();

function marker(kind, p) {
  if (kind === "slides") return `[diapo ${p.pdf_page}]`;
  if (kind === "screens") return `[capture ${p.pdf_page}]`;
  if (kind === "video") return p.printed_page ? `[${p.printed_page}]` : "";
  return p.printed_page ? `[p. ${p.printed_page}]` : `[page ${p.pdf_page} du PDF, sans numéro imprimé]`;
}

async function chaptersOf(type, id) {
  const base = `select ch.id, ch.title, m.id as module_id, m.title as module_title, c.id as course_id, c.code, c.title as course_title
                  from chapters ch join modules m on m.id = ch.module_id join courses c on c.id = m.course_id`;
  const order = ` order by c.semester nulls last, c.code nulls last, c.id, m.position, m.id, ch.position, ch.id`;
  if (type === "chapter") return q(`${base} where ch.id = $1${order}`, [id]);
  if (type === "module") return q(`${base} where m.id = $1${order}`, [id]);
  if (type === "course") return q(`${base} where c.id = $1${order}`, [id]);
  return q(base + order);
}

export async function GET(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const sp = new URL(request.url).searchParams;
  const type = sp.get("scopeType") || "chapter";
  const id = type === "master" ? null : Number(sp.get("scopeId"));
  const opt = {
    corpus: sp.get("corpus") !== "0",
    sheets: sp.get("sheets") !== "0",
    deliverables: sp.get("deliverables") !== "0",
    works: sp.get("works") !== "0",
  };
  const scope = await scopeInfo(type, id);
  if (!scope) return Response.json({ error: "Périmètre introuvable" }, { status: 404 });
  const chapters = await chaptersOf(type, id);
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const out = (t) => controller.enqueue(enc.encode(t));
      try {
        out(PROMPT(scope.label));
        out(`## Plan\n\n${await structureText({ type, id })}\n\n`);

        // aperçus et livrables des niveaux au-dessus du chapitre
        const scopes = [[type, id]];
        if (type === "course") for (const m of new Set(chapters.map((c) => c.module_id))) scopes.push(["module", m]);
        for (const [st, sid] of scopes) {
          if (st === "chapter") continue;
          const ov = (await q(`select content from overviews where scope_type = $1 and scope_id is not distinct from $2 order by id desc limit 1`, [st, sid]))[0];
          if (ov) out(`## Aperçu — ${(await scopeInfo(st, sid))?.label}\n\n${ov.content}\n\n`);
          if (opt.deliverables) {
            const dl = await q(`select distinct on (kind) kind, data from deliverables where scope_type = $1 and scope_id is not distinct from $2 and kind <> 'videos' order by kind, id desc`, [st, sid]);
            for (const d of dl) out(`## ${DELIVERABLE_NAMES[d.kind]} — ${(await scopeInfo(st, sid))?.label}\n\n${strip(deliverableBody(d.kind, d.data))}\n\n`);
          }
        }

        for (const ch of chapters) {
          out(`\n---\n\n# Chapitre : ${ch.title}\n_${ch.code || ch.course_title} › ${ch.module_title}_\n\n`);
          const ov = (await q(`select content from overviews where scope_type = 'chapter' and scope_id = $1 order by id desc limit 1`, [ch.id]))[0];
          if (ov) out(`## Aperçu du chapitre\n\n${ov.content}\n\n`);
          if (opt.sheets) {
            const sheets = await q(`select distinct on (kind) kind, citations from sheets where chapter_id = $1 order by kind, id desc`, [ch.id]);
            for (const s of sheets) out(`## ${s.kind === "fr" ? "Fiche explicative (FR)" : "Revision sheet (EN)"}\n\n${plainSegments(s.citations?.segments)}\n\n`);
          }
          if (opt.deliverables) {
            const dl = await q(`select distinct on (kind) kind, data from deliverables where scope_type = 'chapter' and scope_id = $1 and kind <> 'videos' order by kind, id desc`, [ch.id]);
            for (const d of dl) out(`## ${DELIVERABLE_NAMES[d.kind]}\n\n${strip(deliverableBody(d.kind, d.data))}\n\n`);
          }
          if (opt.works) {
            const works = await q(`select kind, question, answer from works where chapter_id = $1 order by id`, [ch.id]);
            if (works.length) {
              out(`## Mes travaux (self-check, Q&C)\n\n`);
              for (const w of works) out(`**[${w.kind}] ${w.question}**\n\n${w.answer?.trim() ? `Ma réponse : ${w.answer}` : "Ma réponse : (pas encore rédigée)"}\n\n`);
            }
          }
          const docs = await q(`select id, title, kind, intext, reference from documents where chapter_id = $1 and kind <> 'notes' order by id`, [ch.id]);
          if (docs.length) {
            out(`## Documents du chapitre\n\n${docs.map((d) => `- (${d.intext}) ${d.reference || d.title}`).join("\n")}\n\n`);
          }
          if (opt.corpus) {
            for (const d of docs) {
              out(`### Texte intégral : ${d.title}\nRéférence : ${d.reference || d.intext}\nCitation dans le texte : (${d.intext}, p. X)\n\n`);
              const pages = await q(`select pdf_page, printed_page, text from pages where document_id = $1 order by pdf_page`, [d.id]);
              for (const p of pages) if (p.text?.trim()) out(`${marker(d.kind, p)}\n${p.text.trim()}\n\n`);
            }
          }
        }
      } catch (err) {
        out(`\n\n[Export interrompu : ${String(err.message || err)}]\n`);
      }
      controller.close();
    },
  });

  const fname = `Pack ${scope.label}`.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").slice(0, 100);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="pack.md"; filename*=UTF-8''${encodeURIComponent(fname)}.md`,
      "Cache-Control": "no-store",
    },
  });
}
