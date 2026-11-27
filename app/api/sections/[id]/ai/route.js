import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";
import { searchPassages } from "@/lib/search";
import { callClaude, callClaudeBlocks, MODELS } from "@/lib/anthropic";
import { diversify, toDocumentBlock, renderAnswer } from "@/lib/chat";
import { loadAssignment, scopeOf, rulesText, materialsText, chatText, literatureText } from "@/lib/atelier";
import { PERSONAL_EXAMPLES_RULE } from "@/lib/profile";
import { PROFILE, STYLE_CHARTER, EXAMINER_FEEDBACK } from "@/lib/writingRules";
import { runChecks } from "@/lib/checks";

export const maxDuration = 300;

const CITE = `Cite the attached corpus documents (citation feature); the app adds the Harvard reference with the exact page. NEVER write references yourself. "fiche perso", "mon travail déjà rendu" (Camil's already-submitted work: never reuse its wording or structure) and "consigne" documents are not sources. General knowledge must start with "Outside the corpus:".`;

// POST { mode: "model" | "critique" | "translate", lang?: "fr" }
export async function POST(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { id } = await params;
  const { mode, lang } = await request.json();
  try {
    const s = (await q(`select * from assignment_sections where id = $1`, [Number(id)]))[0];
    if (!s) return Response.json({ error: "Introuvable" }, { status: 404 });

    // Traduction de MA version française en anglais académique (ma voix, mes idées, mes citations)
    if (mode === "translate") {
      if (!s.text_fr?.trim()) return Response.json({ error: "La version française de cette partie est vide." }, { status: 400 });
      const r = await callClaude({
        feature: "atelier : traduction FR → EN",
        model: MODELS.main,
        max_tokens: 8000,
        system: `Translate Camil's own French draft into English for a Master's assignment (UiT). ${PROFILE}
Rules: translate faithfully — same ideas, same order, same paragraphs, nothing added or removed. Natural academic English at the level of a good international Master's student, not native-polished and not robotic; vary sentence length.
Keep every citation exactly as written, e.g. (Tiller et al., 2022, p. 3). Keep any quotation already in English verbatim. Leave placeholders like [À TOI : …] untranslated.
Output only the translated text.`,
        messages: [{ role: "user", content: s.text_fr }],
      });
      return Response.json({ text: r.text.trim() });
    }

    const { assignment: a, sections } = await loadAssignment(s.assignment_id);
    const plan = sections.map((x, i) => `${i + 1}. ${x.title} (${x.words || "?"} words) : ${x.brief || ""}`).join("\n");
    const before = sections
      .filter((x) => x.position < s.position)
      .map((x) => `### ${x.title}\n${(x.my_text || x.text_fr || "").slice(0, 2500)}`)
      .join("\n\n")
      .slice(-7000);

    const found = await searchPassages(`${s.title}\n${s.brief || ""}\n${a.thesis || ""}`, scopeOf(a), 50);
    const passages = diversify(found, 16, 4);

    let system;
    let user;
    if (mode === "model") {
      system = `You write a MODEL DRAFT of ONE section of Camil's assignment. He will use it as inspiration and rewrite it himself; he has the last word.
${PROFILE}
Section: « ${s.title} » — about ${s.words || 300} words excluding parenthetical citations (±15%), ${lang === "fr" ? "in FRENCH (Camil will write his English version from it; keep verbatim quotations in English)" : "in English"}.
What this section must do (Camil's plan, in French): ${s.brief || "—"}
Assignment rules: ${rulesText(a.rules)}
Write only this section (no title line, no other sections). Make it connect logically with what precedes. Where personal reflection or experience is expected, insert 1 or 2 placeholders in French like "[À TOI : piste — ex. ton expérience de … en Gironde]" that suggest a CONCRETE example from his profile for him to confirm and write himself; never invent his experiences.
${PERSONAL_EXAMPLES_RULE}
${STYLE_CHARTER}
${EXAMINER_FEEDBACK}
${CITE}`;
      const mats = materialsText(a, 8000);
      const talk = chatText(a, 4000);
      user = `ASSIGNMENT:\n${a.brief}\n\nTHESIS: ${a.thesis || "—"}\n\nFULL OUTLINE:\n${plan}\n\n${mats ? `CAMIL'S OWN NOTES AND DRAFTS (use his ideas and examples first):\n${mats}\n\n` : ""}${talk ? `END OF OUR DISCUSSION:\n${talk}\n\n` : ""}${literatureText(a) ? `EXTRA (NON-PENSUM) LITERATURE CHOSEN BY CAMIL — real publications, cite as (Author, year) without page unless known; you only know their abstracts, do not overstate them:\n${literatureText(a)}\n\n` : ""}${s.text_fr && lang !== "fr" ? `CAMIL'S FRENCH DRAFT OF THIS SECTION (follow its ideas):\n${s.text_fr}\n\n` : ""}WHAT CAMIL HAS ALREADY WRITTEN BEFORE THIS SECTION:\n${before || "(nothing yet)"}`;
    } else {
      const mine = s.my_text?.trim() ? s.my_text : s.text_fr || "";
      if (!mine.trim()) return Response.json({ error: "Écris d'abord ta version de cette partie." }, { status: 400 });
      const checks = runChecks(mine, { target: s.words });
      system = `Tu critiques UNE partie du devoir de Camil, en français, sans la réécrire entièrement. ${PROFILE}
Sections ## : « Points forts », « À améliorer » (du plus important au moins important : exactitude par rapport au corpus — cite les passages —, profondeur critique, réflexion personnelle, lien avec la thèse et avec la partie précédente ; cite la phrase concernée, propose une piste, au plus une reformulation par point), « Vérifications automatiques » (commente les résultats fournis).
${STYLE_CHARTER}
${EXAMINER_FEEDBACK}
Cite les documents joints ; l'application ajoute la référence et la page.`;
      user = `SUJET :\n${a.brief}\n\nTHÈSE : ${a.thesis || "—"}\n\nPARTIE « ${s.title} » (${s.words || "?"} mots visés) — rôle : ${s.brief || "—"}\n\nTEXTE DE CAMIL${s.my_text?.trim() ? "" : " (version française)"} :\n${mine}\n\nVÉRIFICATIONS AUTOMATIQUES :\n${checks.map((c) => `${c.ok ? "OK" : "À CORRIGER"} : ${c.label}`).join("\n")}`;
    }
    const { blocks } = await callClaudeBlocks({
      feature: `atelier : ${mode === "model" ? "modèle de partie" : "critique de partie"}`,
      model: mode === "model" ? MODELS.best : MODELS.main,
      max_tokens: mode === "model" ? 8000 : 3000,
      system,
      messages: [{ role: "user", content: [...passages.map(toDocumentBlock), { type: "text", text: user }] }],
    });
    const value = { segments: renderAnswer(blocks, passages).segments, at: new Date().toISOString(), ...(mode === "model" ? { lang: lang === "fr" ? "fr" : "en" } : {}) };
    await q(`update assignment_sections set ${mode} = $1, updated_at = now() where id = $2`, [JSON.stringify(value), s.id]);
    return Response.json({ [mode]: value });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
