import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";
import { searchPassages, passagesForNamedAuthors } from "@/lib/search";
import { callWithWeb, WEB_RULE } from "@/lib/webCheck";
import { callClaudeBlocks, MODELS } from "@/lib/anthropic";
import { diversify, toDocumentBlock, renderAnswer } from "@/lib/chat";
import { loadAssignment, scopeOf, rulesText, materialsText, literatureText } from "@/lib/atelier";
import { PERSONAL_EXAMPLES_RULE } from "@/lib/profile";
import { PROFILE, EXAMINER_FEEDBACK } from "@/lib/writingRules";
import { structureText } from "@/lib/structure";

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
    // auteurs cités dans le message : leurs passages (avec pages) sont ajoutés
    try {
      const seen = new Set(passages.map((p) => p.id));
      for (const p of await passagesForNamedAuthors(message, query, 3, 8)) if (!seen.has(p.id)) passages.push(p);
    } catch {}

    const plan = sections.map((s, i) => `${i + 1}. ${s.title} (${s.words || "?"} mots) : ${s.brief || ""}`).join("\n");
    const materials = materialsText(a);
    const sc = scopeOf(a);
    const courseMap = await structureText({ type: sc.type, id: sc.id }).catch(() => "");
    const system = `Tu es le partenaire de travail de Camil pour UN devoir précis : tu discutes avec lui, tu ne fais pas un exposé. ${PROFILE}
SUJET DU DEVOIR :
${a.brief || "(pas encore collé)"}
Règles formelles : ${rulesText(a.rules) || "—"}
Problématique retenue : ${a.thesis || "pas encore choisie"}
${plan ? `Plan actuel :\n${plan}` : ""}
${literatureText(a) ? `LITTÉRATURE HORS PENSUM RETENUE PAR CAMIL (vraies publications ; citable avec (Auteur, année) ; tu ne connais que leur résumé) :\n${literatureText(a)}` : ""}
${courseMap ? `Plan du cours et du master (pour conseiller quels chapitres revoir, en les nommant) :\n${courseMap.slice(0, 6000)}` : ""}
${materials ? `NOTES, BROUILLONS ET DOCUMENTS DÉPOSÉS PAR CAMIL (ses idées : pars-en, cite-les quand tu t'en sers, ne les contredis pas sans le dire) :\n${materials}` : ""}

Façon de travailler :
- Avant de commencer, il peut te poser des questions de méthode (comment s'organiser, quel type de texte, quels chapitres ou lectures revoir) : réponds concrètement, en nommant les chapitres et lectures de son cours.
- C'est une DISCUSSION. Réponds à ce qu'il dit, réagis à ses idées, accepte d'être contredit, défends ton point de vue quand il est solide, et termine le plus souvent par UNE question ou un choix à faire.
- Brainstorm : quand il le demande, propose des angles numérotés (thèse en une phrase, 2 ou 3 arguments appuyés sur le corpus, limite principale). S'il en choisit, en combine ou en conteste, retravaille-les avec lui.
- Quand une problématique ou un plan semble arrêté, propose une formulation claire qu'il pourra coller dans le champ « Problématique » ou utiliser pour le plan.
- Rédaction dans la discussion : seulement s'il le demande ; dans ce cas, texte complet, d'un seul tenant.
- Langue : celle de son dernier message (français par défaut). Les citations textuelles restent en anglais.
${PERSONAL_EXAMPLES_RULE}
${WEB_RULE}
- Pages : si une lecture n'est pas dans les passages joints mais qu'une « fiche perso » jointe donne sa référence avec une page, reprends cette page en précisant « page d'après ta fiche, à vérifier dans le PDF ». Ne dis pas que tu n'as pas la page sans avoir regardé les fiches jointes ; si vraiment aucune source jointe ne la donne, dis quel document importer pour l'avoir.
${EXAMINER_FEEDBACK}
Cite les documents joints (fonction de citation) ; l'application ajoute la référence Harvard et la page. N'écris jamais de référence toi-même. Les « fiche perso », « mon travail déjà rendu » et « consigne » ne sont pas des sources (travail déjà rendu : ne pas en reprendre formulations ni structure). Ce qui vient de tes connaissances générales commence par « Hors corpus : ».`;

    const messages = [...history, { role: "user", content: [...passages.map(toDocumentBlock), { type: "text", text: message }] }];
    const started = Date.now();
    let blocks = [];
    let truncated = false;
    let convo = messages;
    for (let round = 0; round < 3; round++) {
      const args = { feature: "atelier : discussion", model: MODELS.main, system, messages: convo, max_tokens: 6000, continueOnLimit: false };
      const r = round === 0 ? await callWithWeb(callClaudeBlocks, args) : await callClaudeBlocks(args);
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
