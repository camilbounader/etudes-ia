import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";
import { searchPassages } from "@/lib/search";
import { callClaudeBlocks, MODELS } from "@/lib/anthropic";
import { diversify, toDocumentBlock, renderAnswer } from "@/lib/chat";
import { loadAssignment, scopeOf, rulesText } from "@/lib/atelier";
import { PROFILE, STYLE_CHARTER, EXAMINER_FEEDBACK } from "@/lib/writingRules";
import { runChecks } from "@/lib/checks";

export const maxDuration = 300;

const CITE = `Cite the attached corpus documents (citation feature); the app adds the Harvard reference with the exact page. NEVER write references yourself. "fiche perso" documents are not sources. General knowledge must start with "Outside the corpus:".`;

// POST { mode: "model" | "critique" }
export async function POST(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { id } = await params;
  const { mode } = await request.json();
  try {
    const s = (await q(`select * from assignment_sections where id = $1`, [Number(id)]))[0];
    if (!s) return Response.json({ error: "Introuvable" }, { status: 404 });
    const { assignment: a, sections } = await loadAssignment(s.assignment_id);
    const plan = sections.map((x, i) => `${i + 1}. ${x.title} (${x.words || "?"} words) : ${x.brief || ""}`).join("\n");
    const before = sections
      .filter((x) => x.position < s.position)
      .map((x) => `### ${x.title}\n${(x.my_text || "").slice(0, 2500)}`)
      .join("\n\n")
      .slice(-7000);

    const found = await searchPassages(`${s.title}\n${s.brief || ""}\n${a.thesis || ""}`, scopeOf(a), 50);
    const passages = diversify(found, 16, 4);

    let system;
    let user;
    if (mode === "model") {
      system = `You write a MODEL DRAFT of ONE section of Camil's assignment. He will use it as inspiration and rewrite it himself; he has the last word.
${PROFILE}
Section: « ${s.title} » — about ${s.words || 300} words excluding parenthetical citations (±15%), in English.
What this section must do (Camil's plan, in French): ${s.brief || "—"}
Assignment rules: ${rulesText(a.rules)}
Write only this section (no title line, no other sections). Make it connect logically with what precedes. Where personal reflection or experience is expected, insert 1 or 2 placeholders in French like "[À TOI : … ]" instead of inventing his experiences.
${STYLE_CHARTER}
${EXAMINER_FEEDBACK}
${CITE}`;
      user = `ASSIGNMENT:\n${a.brief}\n\nTHESIS: ${a.thesis || "—"}\n\nFULL OUTLINE:\n${plan}\n\nWHAT CAMIL HAS ALREADY WRITTEN BEFORE THIS SECTION:\n${before || "(nothing yet)"}`;
    } else {
      if (!s.my_text?.trim()) return Response.json({ error: "Écris d'abord ta version de cette partie." }, { status: 400 });
      const checks = runChecks(s.my_text, { target: s.words });
      system = `Tu critiques UNE partie du devoir de Camil, en français, sans la réécrire entièrement. ${PROFILE}
Sections ## : « Points forts », « À améliorer » (du plus important au moins important : exactitude par rapport au corpus — cite les passages —, profondeur critique, réflexion personnelle, lien avec la thèse et avec la partie précédente ; cite la phrase concernée, propose une piste, au plus une reformulation par point), « Vérifications automatiques » (commente les résultats fournis).
${STYLE_CHARTER}
${EXAMINER_FEEDBACK}
Cite les documents joints ; l'application ajoute la référence et la page.`;
      user = `SUJET :\n${a.brief}\n\nTHÈSE : ${a.thesis || "—"}\n\nPARTIE « ${s.title} » (${s.words || "?"} mots visés) — rôle : ${s.brief || "—"}\n\nTEXTE DE CAMIL :\n${s.my_text}\n\nVÉRIFICATIONS AUTOMATIQUES :\n${checks.map((c) => `${c.ok ? "OK" : "À CORRIGER"} : ${c.label}`).join("\n")}`;
    }
    const { blocks } = await callClaudeBlocks({
      feature: `atelier : ${mode === "model" ? "modèle de partie" : "critique de partie"}`,
      model: mode === "model" ? MODELS.best : MODELS.main,
      max_tokens: mode === "model" ? 8000 : 3000,
      system,
      messages: [{ role: "user", content: [...passages.map(toDocumentBlock), { type: "text", text: user }] }],
    });
    const value = { segments: renderAnswer(blocks, passages).segments, at: new Date().toISOString() };
    await q(`update assignment_sections set ${mode} = $1, updated_at = now() where id = $2`, [JSON.stringify(value), s.id]);
    return Response.json({ [mode]: value });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
