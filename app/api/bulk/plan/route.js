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
- "kind" : "reading" (lecture du corpus : article, chapitre de livre, rapport), "slides" (PDF de diapos du cours), "screens" (captures d'écran : Word presque sans texte mais avec des images, ou image), "notes" (fiche explicative ou de révision, résumé, notes de cours rédigées), "assignment" (sujet d'examen, consigne de devoir), "own" (devoir déjà rédigé ou rendu par l'étudiant lui-même : assignment, learning diary, Q&C, examen rendu), "other" ;
- "action" : "import" ou "skip" ;
- "reason" : 3 à 10 mots en français.
Règles pour "skip" :
- le fichier est déjà dans l'application (indiqué "DOUBLON PROBABLE") ;
- captures d'écran de la page Canvas d'un chapitre dont la page Canvas est déjà importée ("page Canvas : oui") ;
- captures de diapos alors que le chapitre a déjà des diapos ("diapos : oui") ;
- fichier vide, brouillon sans intérêt, ou sans rapport avec les cours.
Les fiches ("notes") sont importées sauf si elles sont quasi vides (moins de 300 caractères).
Si un « chapitre déduit du dossier » est indiqué, garde-le sauf erreur manifeste.
Réponds UNIQUEMENT par un tableau JSON, un objet par fichier, dans l'ordre :
[{"f":"F1","name":"début du nom du fichier","chapter":12,"kind":"reading","action":"import","reason":"…"}, …]`;

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

    // 2. Rattachement par nom de dossier : un dossier du chemin qui porte le
    //    nom d'un chapitre (ex. « 1.1 The physical science of climate change »)
    const chapNorm = chapters.map((c) => ({ id: c.id, n: normText(c.title) })).filter((c) => c.n.length >= 4);
    for (const f of enriched) {
      const folders = String(f.path).split("/").slice(0, -1).reverse();
      for (const folder of folders) {
        const fn = normText(folder);
        if (fn.length < 4 && !/^\s*\d/.test(folder)) continue;
        const exact = chapNorm.find((c) => c.n === fn);
        const prefix = fn.length >= 4 ? exact || chapNorm.find((c) => fn.startsWith(c.n) || c.n.startsWith(fn)) : null;
        // « 1.1 » au début : doit aussi correspondre (évite 1.1 / 1.10)
        const num = folder.match(/^\s*(\d+(?:\.\d+)*)/)?.[1];
        const byNum =
          num && chapters.filter((c) => c.title.trim().match(/^(\d+(?:\.\d+)*)/)?.[1] === num.replace(/\.$/, ""));
        const hit = exact || (byNum && byNum.length === 1 ? { id: byNum[0].id } : null) || prefix;
        if (hit) {
          f.folderChapter = hit.id;
          break;
        }
      }
    }

    // 3. Classement par Claude Haiku, par lots (numérotation LOCALE au lot)
    const chapterList = chapters
      .map((c) => `${c.id}: ${c.code || c.course_title} > ${c.module_title} > ${c.title} (page Canvas : ${c.has_page ? "oui" : "non"} ; diapos : ${c.has_slides ? "oui" : "non"})`)
      .join("\n");
    const todo = enriched.filter((f) => !f.unsupported);
    const decisions = new Map();
    const batches = [];
    for (let k = 0; k < todo.length; k += 10) batches.push(todo.slice(k, k + 10));

    await Promise.all(
      batches.map(async (batch) => {
        const listing = batch
          .map(
            (f, j) =>
              `### F${j + 1}\nchemin : ${f.path}` +
              (f.folderChapter ? `\nchapitre déduit du dossier : ${f.folderChapter}` : "") +
              `\nnom : ${f.name}\ntype : ${f.ext}${f.pages ? `, ${f.pages} pages` : ""}, ${f.textLength} caractères de texte, ${f.imageCount || 0} image(s)` +
              (f.duplicateOf ? `\nDOUBLON PROBABLE de « ${f.duplicateOf.title} » (chapitre ${f.duplicateOf.chapterId})` : "") +
              `\ndébut du texte : ${String(f.textSample || "").slice(0, 700).replace(/\s+/g, " ")}`
          )
          .join("\n\n");
        try {
          const { text } = await callClaude({
            feature: "tri import en vrac",
            model: MODELS.fast,
            max_tokens: 4000,
            system: PROMPT,
            messages: [{ role: "user", content: `CHAPITRES :\n${chapterList}\n\nFICHIERS :\n${listing}` }],
          });
          const arr = JSON.parse((text.match(/\[[\s\S]*\]/) || ["[]"])[0]);
          arr.forEach((d, pos) => {
            // F3 -> 3e fichier du lot ; à défaut, la position dans la réponse
            const num = Number(String(d.f ?? "").replace(/\D/g, ""));
            const f = batch[num >= 1 ? num - 1 : pos];
            if (!f) return;
            // contrôle souple : si un nom est renvoyé, il doit ressembler au fichier
            if (d.name) {
              const a = normName(f.name);
              const b = normName(String(d.name).split("/").pop());
              if (a && b && !a.includes(b.slice(0, 6)) && !b.includes(a.slice(0, 6))) return;
            }
            decisions.set(f.i, d);
          });
        } catch (e) {
          for (const f of batch) decisions.set(f.i, { action: "import", kind: "other", chapter: null, reason: "tri automatique échoué : à vérifier" });
        }
      })
    );

    const validIds = new Set(chapters.map((c) => c.id));
    const plan = enriched.map((f) => {
      if (f.unsupported) return { i: f.i, path: f.path, action: "skip", kind: "other", chapter: null, reason: f.unsupported };
      const d = decisions.get(f.i) || { reason: f.duplicateOf ? "" : "classé sans l'IA : à vérifier" };
      // type par défaut, sans IA
      const guess =
        f.ext === "pdf" ? "reading" : f.ext === "image" ? "screens" : f.ext === "docx" ? (f.textLength >= 300 ? "notes" : "screens") : "other";
      let kind = d.kind || guess;
      if (f.ext === "image") kind = "screens";
      if (f.ext === "docx" && kind === "reading") kind = f.textLength < 300 && f.imageCount ? "screens" : "notes";
      return {
        i: f.i,
        path: f.path,
        action: f.duplicateOf ? "skip" : d.action === "skip" ? "skip" : "import",
        kind,
        chapter: f.folderChapter || (validIds.has(Number(d.chapter)) ? Number(d.chapter) : f.duplicateOf?.chapterId || null),
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
