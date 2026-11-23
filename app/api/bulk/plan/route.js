import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";
import { callClaude, MODELS } from "@/lib/anthropic";

export const maxDuration = 300;

const normText = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");
const normName = (s) => normText(String(s || "").replace(/\.[a-z0-9]+$/i, ""));

const PROMPT = `Tu tries les fichiers d'études d'un étudiant de Master (cours en anglais à UiT, notes souvent en français).
Pour chaque fichier, choisis :
- "chapter" : l'identifiant du chapitre le plus probable dans la liste fournie (utilise le chemin du dossier, le nom du fichier et le début du texte), ou null si impossible à dire ;
- "kind" : "reading" (lecture du corpus : article, chapitre de livre, rapport), "slides" (PDF de diapos du cours), "screens" (captures d'écran : Word presque sans texte mais avec des images, ou image), "notes" (fiche explicative ou de révision, résumé, notes de cours rédigées), "assignment" (sujet d'examen, consigne de devoir, devoir rendu), "other" ;
- "action" : "import" ou "skip" ;
- "reason" : 3 à 10 mots en français.
Règles pour "skip" :
- le fichier est déjà dans l'application (indiqué "DOUBLON PROBABLE") ;
- captures d'écran de la page Canvas d'un chapitre dont la page Canvas est déjà importée ("page Canvas : oui") ;
- captures de diapos alors que le chapitre a déjà des diapos ("diapos : oui") ;
- fichier vide, brouillon sans intérêt, ou sans rapport avec les cours.
Les fiches ("notes") sont importées sauf si elles sont quasi vides (moins de 300 caractères).
Réponds UNIQUEMENT par un tableau JSON : [{"i":0,"chapter":12,"kind":"reading","action":"import","reason":"…"}, …]`;

// POST { files: [{ path, name, ext, pages, textLength, textSample, imageCount }] }
// -> plan d'import : chapitre, type, importer ou ignorer, raison.
export async function POST(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { files = [] } = await request.json();

  try {
    const chapters = await q(
      `select ch.id, ch.title, m.title as module_title, c.code, c.title as course_title,
              exists(select 1 from documents d where d.chapter_id = ch.id and d.kind = 'page') as has_page,
              exists(select 1 from documents d where d.chapter_id = ch.id and d.kind in ('slides','screens')) as has_slides
         from chapters ch join modules m on m.id = ch.module_id join courses c on c.id = m.course_id
        order by c.id, m.position, ch.position`
    );
    const docs = await q(
      `select d.id, d.title, d.chapter_id, d.kind, (select left(text, 600) from pages p where p.document_id = d.id order by pdf_page limit 1) as first_text
         from documents d`
    );
    const docSigs = docs.map((d) => ({ ...d, sig: normText(d.first_text).slice(0, 220), nname: normName(d.title) }));

    // 1. Doublons (déterministe) : même début de texte ou même nom
    const enriched = files.map((f, i) => {
      const sig = normText(f.textSample).slice(0, 220);
      const nname = normName(f.name);
      const dup = docSigs.find(
        (d) => (sig.length > 80 && d.sig.length > 80 && (d.sig.startsWith(sig.slice(0, 120)) || sig.startsWith(d.sig.slice(0, 120)))) ||
          (nname.length > 6 && d.nname === nname)
      );
      return { ...f, i, duplicateOf: dup ? { id: dup.id, title: dup.title, chapterId: dup.chapter_id } : null };
    });

    // 2. Classement par Claude Haiku, par lots
    const chapterList = chapters
      .map((c) => `${c.id}: ${c.code || c.course_title} > ${c.module_title} > ${c.title} (page Canvas : ${c.has_page ? "oui" : "non"} ; diapos : ${c.has_slides ? "oui" : "non"})`)
      .join("\n");
    const todo = enriched.filter((f) => !f.unsupported);
    const decisions = new Map();
    const batches = [];
    for (let k = 0; k < todo.length; k += 15) batches.push(todo.slice(k, k + 15));

    await Promise.all(
      batches.map(async (batch) => {
        const listing = batch
          .map(
            (f) =>
              `### Fichier ${f.i}\nchemin : ${f.path}\ntype : ${f.ext}${f.pages ? `, ${f.pages} pages` : ""}, ${f.textLength} caractères de texte, ${f.imageCount || 0} image(s)` +
              (f.duplicateOf ? `\nDOUBLON PROBABLE de « ${f.duplicateOf.title} » (chapitre ${f.duplicateOf.chapterId})` : "") +
              `\ndébut du texte : ${String(f.textSample || "").slice(0, 700).replace(/\s+/g, " ")}`
          )
          .join("\n\n");
        try {
          const { text } = await callClaude({
            model: MODELS.fast,
            max_tokens: 3000,
            system: PROMPT,
            messages: [{ role: "user", content: `CHAPITRES :\n${chapterList}\n\nFICHIERS :\n${listing}` }],
          });
          const arr = JSON.parse((text.match(/\[[\s\S]*\]/) || ["[]"])[0]);
          for (const d of arr) decisions.set(Number(d.i), d);
        } catch (e) {
          for (const f of batch) decisions.set(f.i, { action: "import", kind: "other", chapter: null, reason: "tri automatique échoué : à vérifier" });
        }
      })
    );

    const validIds = new Set(chapters.map((c) => c.id));
    const plan = enriched.map((f) => {
      if (f.unsupported) return { i: f.i, path: f.path, action: "skip", kind: "other", chapter: null, reason: f.unsupported };
      const d = decisions.get(f.i) || {};
      let kind = d.kind || "other";
      if (f.ext === "image") kind = "screens";
      if (f.ext === "docx" && kind === "reading") kind = f.textLength < 300 && f.imageCount ? "screens" : "notes";
      return {
        i: f.i,
        path: f.path,
        action: f.duplicateOf ? "skip" : d.action === "skip" ? "skip" : "import",
        kind,
        chapter: validIds.has(Number(d.chapter)) ? Number(d.chapter) : f.duplicateOf?.chapterId || null,
        reason: f.duplicateOf ? `déjà importé : ${f.duplicateOf.title}`.slice(0, 120) : d.reason || "",
      };
    });

    return Response.json({
      plan,
      chapters: chapters.map((c) => ({ id: c.id, label: `${c.code || c.course_title} › ${c.module_title} › ${c.title}` })),
    });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
