import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";
import { searchPassages } from "@/lib/search";
import { callClaude, callClaudeBlocks, parseJson, MODELS } from "@/lib/anthropic";
import { diversify, toDocumentBlock, renderAnswer } from "@/lib/chat";
import { loadAssignment, scopeOf, rulesText, materialsText, chatText, literatureText } from "@/lib/atelier";
import { PERSONAL_EXAMPLES_RULE } from "@/lib/profile";
import { PROFILE, STYLE_CHARTER, EXAMINER_FEEDBACK } from "@/lib/writingRules";
import { runChecks, wordsExcludingCitations } from "@/lib/checks";
import { extractCitations, matchDocument } from "@/lib/citeParse";

export const maxDuration = 300;

const CITE = `Cite les documents joints (fonction de citation) ; l'application ajoute la référence et la page. N'écris jamais de référence toi-même. Les « fiche perso » ne sont pas des sources. Ce qui vient de tes connaissances générales commence par « Hors corpus : ».`;

const RULES_PROMPT = `Extract the formal rules of this university assignment. Answer ONLY with JSON:
{"words_target":number|null,"words_min":number|null,"words_max":number|null,"pages":"text or null","min_readings":number|null,
"page_numbers_required":true|false,"references_excluded":true|false,"ai_level":1|2|3|4|null,"deadline":"text or null","language":"English|...","format_notes":"short text or null"}
Rules: if length is given in pages only, estimate words_target with ~400 words per page (Times New Roman 12, 1.5 spacing) and say so in format_notes.
If a tolerance like ±10% is given, compute words_min/words_max. Do not invent anything else.`;

// POST { step: "analyze" | "brainstorm" | "plan" | "global" }
export async function POST(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { id } = await params;
  const { step } = await request.json();
  try {
    const data = await loadAssignment(id);
    if (!data) return Response.json({ error: "Introuvable" }, { status: 404 });
    const { assignment: a, sections, docs } = data;
    const scope = scopeOf(a);
    if (!a.brief?.trim() && step !== "global") return Response.json({ error: "Colle d'abord le sujet ou la consigne." }, { status: 400 });

    if (step === "analyze") {
      const r1 = await callClaude({ feature: "atelier : règles", model: MODELS.fast, max_tokens: 800, system: RULES_PROMPT, messages: [{ role: "user", content: a.brief }] });
      const rules = { ...(a.rules || {}), ...(parseJson(r1.text) || {}) };
      const found = await searchPassages(a.brief, scope, 30);
      const passages = diversify(found, 10, 2);
      const { blocks } = await callClaudeBlocks({
        feature: "atelier : analyse",
        model: MODELS.main,
        max_tokens: 2500,
        system: `Tu analyses un sujet de devoir universitaire pour Camil. ${PROFILE}
En français, sections ## : « Ce qui est demandé » (reformulation précise, verbes de consigne), « Critères et attentes » (ce qui sera évalué, d'après le sujet), « Pièges à éviter » (d'après le sujet et les retours de l'examinateur), « Lectures du cours directement utiles » (citées), « Questions à clarifier » (si le sujet est ambigu).
${EXAMINER_FEEDBACK}
${CITE}`,
        messages: [{ role: "user", content: [...passages.map(toDocumentBlock), { type: "text", text: `SUJET :\n${a.brief}` }] }],
      });
      const analysis = { segments: renderAnswer(blocks, passages).segments, at: new Date().toISOString() };
      await q(`update assignments set rules = $1, analysis = $2, updated_at = now() where id = $3`, [JSON.stringify(rules), JSON.stringify(analysis), a.id]);
      return Response.json({ rules, analysis });
    }

    if (step === "brainstorm") {
      const found = await searchPassages(`${a.brief}\n${a.thesis || ""}`, scope, 60);
      const passages = diversify(found, 22, 3);
      const { blocks } = await callClaudeBlocks({
        feature: "atelier : brainstorm",
        model: MODELS.main,
        max_tokens: 4000,
        system: `Tu fais un brainstorming avec Camil pour un devoir. ${PROFILE}
En français. Propose 3 ou 4 ANGLES distincts (## Angle 1 : titre…). Pour chacun : la thèse en une phrase, 3 arguments appuyés sur le corpus (cités), les contre-arguments ou limites, ce qui le rend original ou risqué, et un lien possible avec l'expérience de Camil ou un cas national précis (Norvège, France, Arctique) à vérifier.
${PERSONAL_EXAMPLES_RULE}
Termine par ## Mon conseil : quel angle choisir selon les critères du sujet, et pourquoi.
${a.thesis ? `Camil a déjà une idée de problématique : « ${a.thesis} ». Tiens-en compte.` : ""}
Règles formelles : ${rulesText(a.rules)}
${EXAMINER_FEEDBACK}
${CITE}`,
        messages: [{ role: "user", content: [...passages.map(toDocumentBlock), { type: "text", text: `SUJET :\n${a.brief}` }] }],
      });
      const brainstorm = { segments: renderAnswer(blocks, passages).segments, at: new Date().toISOString() };
      await q(`update assignments set brainstorm = $1, updated_at = now() where id = $2`, [JSON.stringify(brainstorm), a.id]);
      return Response.json({ brainstorm });
    }

    if (step === "plan") {
      const target = a.rules?.words_target || 1500;
      const docList = docs.filter((d) => d.kind === "reading" || d.kind === "web").map((d) => `- ${d.intext} : ${d.title}`).join("\n");
      const r = await callClaude({
        feature: "atelier : plan",
        model: MODELS.main,
        max_tokens: 5000,
        system: `You design the detailed outline of a Master's assignment for an international student. ${PROFILE}
Total length: about ${target} words (excluding references), split across sections including a short introduction and conclusion.
${rulesText(a.rules)}
Answer ONLY with JSON: {"thesis":"one-sentence thesis in English","sections":[{"title":"section title in English","words":number,"brief":"in French: what this section must do, key argument, which readings (by author, year) and which personal example from Camil's profile could fit (as a suggestion)"}]}
The words must add up to about ${target}. Use 4 to 8 sections. Prefer an argumentative progression (dialectical when relevant), no artificial headings if the assignment is a short essay.
${PERSONAL_EXAMPLES_RULE}
Available course readings:\n${docList}`,
        messages: [
          {
            role: "user",
            content: `ASSIGNMENT:\n${a.brief}\n\n${a.thesis ? `CHOSEN PROBLEM/ANGLE: ${a.thesis}\n\n` : ""}${
              materialsText(a, 10000) ? `CAMIL'S OWN NOTES, DRAFTS AND IDEAS (build the outline on them):\n${materialsText(a, 10000)}\n\n` : ""
            }${chatText(a) ? `END OF OUR DISCUSSION (decisions taken there prevail):\n${chatText(a)}\n\n` : ""}${literatureText(a) ? `EXTRA LITERATURE CHOSEN BY CAMIL (can be assigned to sections):\n${literatureText(a)}` : ""}`,
          },
        ],
      });
      const plan = parseJson(r.text);
      if (!plan?.sections?.length) throw new Error("Le plan proposé est illisible, réessaie.");
      return Response.json({ plan });
    }

    if (step === "global") {
      const full = sections.map((s) => `${s.title}\n\n${s.my_text || ""}`).join("\n\n");
      if (!sections.some((s) => s.my_text?.trim())) return Response.json({ error: "Aucune partie rédigée par toi pour l'instant." }, { status: 400 });
      // contrôles formels
      const texts = sections.map((s) => s.my_text || "").join("\n\n");
      const words = wordsExcludingCitations(texts);
      const cites = extractCitations(texts);
      const matched = new Map();
      const unmatched = [];
      const noPage = [];
      for (const c of cites) {
        const d = matchDocument(c, docs);
        if (d) matched.set(d.id, d);
        else if (!matchDocument(c, a.literature?.items || [])) unmatched.push(c.raw);
        if (!c.page) noPage.push(c.raw);
      }
      const r = a.rules || {};
      const report = [
        { ok: !r.words_target || (words >= (r.words_min || r.words_target * 0.9) && words <= (r.words_max || r.words_target * 1.1)), label: `${words} mots hors citations${r.words_target ? ` (cible ${r.words_target}${r.words_min ? `, ${r.words_min}–${r.words_max}` : ""})` : ""}` },
        { ok: !r.min_readings || matched.size >= r.min_readings, label: `${matched.size} lecture(s) du cours citée(s)${r.min_readings ? ` (minimum ${r.min_readings})` : ""} : ${[...matched.values()].map((d) => d.intext).join(" ; ") || "aucune"}` },
        { ok: !r.page_numbers_required || noPage.length === 0, label: noPage.length ? `${noPage.length} citation(s) sans numéro de page : ${noPage.slice(0, 8).join(" ; ")}` : "Toutes les citations ont une page" },
        { ok: unmatched.length === 0, label: unmatched.length ? `${unmatched.length} citation(s) hors corpus à vérifier (référence à ajouter à la main) : ${[...new Set(unmatched)].slice(0, 8).join(" ; ")}` : "Toutes les citations correspondent au corpus" },
        ...runChecks(texts).slice(1),
      ];
      const found = await searchPassages(a.brief, scope, 40);
      const passages = diversify(found, 14, 2);
      const { blocks } = await callClaudeBlocks({
        feature: "atelier : relecture globale",
        model: MODELS.main,
        max_tokens: 3500,
        system: `Tu relis l'ensemble du devoir de Camil, en français. ${PROFILE}
Sections ## : « Verdict » (3 lignes : répond-il au sujet ? note probable selon les critères), « Argumentation et structure » (fil conducteur, transitions, équilibre des parties), « Usage du corpus » (exactitude, profondeur critique, lectures manquantes utiles — citées), « Réflexion personnelle et exemples », « Forme » (d'après les contrôles fournis), « Les 5 corrections prioritaires » (liste ordonnée, chacune avec la phrase concernée).
${STYLE_CHARTER}
${EXAMINER_FEEDBACK}
${CITE}`,
        messages: [
          {
            role: "user",
            content: [
              ...passages.map(toDocumentBlock),
              { type: "text", text: `SUJET :\n${a.brief}\n\nRÈGLES : ${rulesText(a.rules)}\n\nCONTRÔLES AUTOMATIQUES :\n${report.map((x) => `${x.ok ? "OK" : "À CORRIGER"} : ${x.label}`).join("\n")}\n\nDEVOIR DE CAMIL :\n${full}` },
            ],
          },
        ],
      });
      const global_critique = { segments: renderAnswer(blocks, passages).segments, report, at: new Date().toISOString() };
      await q(`update assignments set global_critique = $1, updated_at = now() where id = $2`, [JSON.stringify(global_critique), a.id]);
      return Response.json({ global_critique });
    }
    return Response.json({ error: "Étape inconnue" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
