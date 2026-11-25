import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";
import { searchPassages } from "@/lib/search";
import { callClaudeBlocks, MODELS } from "@/lib/anthropic";
import { diversify, toDocumentBlock, renderAnswer } from "@/lib/chat";
import { loadAssignment, scopeOf, rulesText, materialsText } from "@/lib/atelier";
import { PROFILE, EXAMINER_FEEDBACK } from "@/lib/writingRules";

export const maxDuration = 300;

// Discussion d'atelier : brainstorm, choix de l'angle, questions sur le devoir.
// POST { message } ; DELETE : efface la discussion
export async function POST(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { id } = await params;
  const { message } = await request.json();
  if (!message?.trim()) return Response.json({ error: "Message vide" }, { status: 400 });
  try {
    const { assignment: a, sections } = await loadAssignment(id);
    const chat = Array.isArray(a.chat) ? a.chat : [];
    const history = chat.slice(-12).map((m) => ({ role: m.role, content: m.content }));
    while (history.length && history[0].role !== "user") history.shift();

    const lastUser = [...chat].reverse().find((m) => m.role === "user");
    const query = `${a.brief?.slice(0, 600) || ""}\n${a.thesis || ""}\n${message.length < 80 && lastUser ? lastUser.content : ""}\n${message}`;
    const found = await searchPassages(query, scopeOf(a), 45);
    const passages = diversify(found, 15, 3);

    const plan = sections.map((s, i) => `${i + 1}. ${s.title} (${s.words || "?"} mots) : ${s.brief || ""}`).join("\n");
    const materials = materialsText(a);
    const system = `Tu es le partenaire de travail de Camil pour UN devoir précis : tu discutes avec lui, tu ne fais pas un exposé. ${PROFILE}
SUJET DU DEVOIR :
${a.brief || "(pas encore collé)"}
Règles formelles : ${rulesText(a.rules) || "—"}
Problématique retenue : ${a.thesis || "pas encore choisie"}
${plan ? `Plan actuel :\n${plan}` : ""}
${materials ? `NOTES, BROUILLONS ET DOCUMENTS DÉPOSÉS PAR CAMIL (ses idées : pars-en, cite-les quand tu t'en sers, ne les contredis pas sans le dire) :\n${materials}` : ""}

Façon de travailler :
- C'est une DISCUSSION. Réponds à ce qu'il dit, réagis à ses idées, accepte d'être contredit, défends ton point de vue quand il est solide, et termine le plus souvent par UNE question ou un choix à faire.
- Brainstorm : quand il le demande, propose des angles numérotés (thèse en une phrase, 2 ou 3 arguments appuyés sur le corpus, limite principale). S'il en choisit, en combine ou en conteste, retravaille-les avec lui.
- Quand une problématique ou un plan semble arrêté, propose une formulation claire qu'il pourra coller dans le champ « Problématique » ou utiliser pour le plan.
- Rédaction dans la discussion : seulement s'il le demande ; dans ce cas, texte complet, d'un seul tenant.
- Langue : celle de son dernier message (français par défaut). Les citations textuelles restent en anglais.
${EXAMINER_FEEDBACK}
Cite les documents joints (fonction de citation) ; l'application ajoute la référence Harvard et la page. N'écris jamais de référence toi-même. Les « fiche perso » ne sont pas des sources. Ce qui vient de tes connaissances générales commence par « Hors corpus : ».`;

    const messages = [...history, { role: "user", content: [...passages.map(toDocumentBlock), { type: "text", text: message }] }];
    const started = Date.now();
    let blocks = [];
    let truncated = false;
    let convo = messages;
    for (let round = 0; round < 3; round++) {
      const r = await callClaudeBlocks({ feature: "atelier : discussion", model: MODELS.main, system, messages: convo, max_tokens: 6000 });
      blocks = blocks.concat(r.blocks);
      truncated = r.stop === "max_tokens";
      if (!truncated || Date.now() - started > 150000) break;
      const soFar = blocks.filter((b) => b.type === "text").map((b) => b.text).join("");
      convo = [...messages, { role: "assistant", content: soFar }, { role: "user", content: "Ta réponse a été coupée. Continue exactement là où tu t'es arrêté, sans rien répéter." }];
    }
    const { segments, plain } = renderAnswer(blocks, passages);
    const now = new Date().toISOString();
    const next = [...chat, { role: "user", content: message, at: now }, { role: "assistant", content: plain, segments, truncated, at: now }];
    await q(`update assignments set chat = $1, updated_at = now() where id = $2`, [JSON.stringify(next.slice(-80)), a.id]);
    return Response.json({ chat: next.slice(-80) });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { id } = await params;
  await q(`update assignments set chat = '[]'::jsonb, updated_at = now() where id = $1`, [Number(id)]);
  return Response.json({ chat: [] });
}
