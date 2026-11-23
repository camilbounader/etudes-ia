import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";
import { searchPassages } from "@/lib/search";
import { callClaudeBlocks, MODELS } from "@/lib/anthropic";
import { diversify, toDocumentBlock, renderAnswer } from "@/lib/chat";
import { runChecks } from "@/lib/checks";
import { PROFILE, STYLE_CHARTER, EXAMINER_FEEDBACK } from "@/lib/writingRules";

export const maxDuration = 300;

const KIND_LABEL = { selfcheck: "self-check question", qc: "Question & Comment (Q&C)", ld: "learning diary", other: "assignment" };
const CITE = `Cite the attached corpus documents (the citation feature); the app adds the Harvard reference with the exact page. NEVER write references or page numbers yourself. Documents titled "fiche perso" are personal notes, not sources: never cite them. Anything from general knowledge must start with "Outside the corpus:" (or « Hors corpus : » in French).`;

function prompts(mode, work, chapterTitle) {
  const task = `${KIND_LABEL[work.kind] || "task"} for the chapter « ${chapterTitle} »`;
  if (mode === "hints") {
    return {
      model: MODELS.main,
      max_tokens: 2500,
      system: `Tu aides Camil à préparer sa réponse à une ${task}. ${PROFILE}
Donne-lui des PISTES en français, sans rédiger la réponse :
## Ce qui est demandé
1 à 3 phrases.
## Notions et auteurs à mobiliser
Puces, chacune appuyée sur le corpus (citations).
## Angles critiques possibles
2 à 4 tensions, limites ou débats à exploiter, avec une question à se poser pour chacun.
## Ton expérience
1 ou 2 idées pour relier la question à son expérience (prévention, pompier en Gironde) ou à un cas français, à développer par lui-même.
## Pièges à éviter
2 ou 3 puces (d'après les retours de l'examinateur).
${EXAMINER_FEEDBACK}
${CITE}`,
    };
  }
  if (mode === "model") {
    const target = work.target_words || (work.kind === "qc" ? 400 : 250);
    return {
      model: MODELS.best,
      max_tokens: 6000,
      system: `You write a MODEL ANSWER for Camil's ${task}. Camil will use it as inspiration and rewrite it himself; he has the last word.
${PROFILE}
Length: about ${target} words excluding parenthetical citations (±15%). Write in English.
${work.kind === "qc" ? "Format: a short paragraph titled 'Comment' (deep, analytical engagement with the readings, in his own voice) and one titled 'Question' (a discussion question that can open a debate or critique the text)." : "Format: continuous paragraphs answering the question directly."}
Where personal reflection or experience is expected, insert 1 to 3 placeholders in French like "[À TOI : relie à ton expérience de … ]" instead of inventing his experiences.
${STYLE_CHARTER}
${EXAMINER_FEEDBACK}
${CITE}`,
    };
  }
  // critique
  return {
    model: MODELS.main,
    max_tokens: 3000,
    system: `Tu relis la réponse de Camil à une ${task} et tu la critiques en français, sans la réécrire entièrement.
${PROFILE}
Structure :
## Points forts
2 ou 3 puces.
## À améliorer
Les problèmes les plus importants d'abord : compréhension du sujet, exactitude par rapport au corpus (cite les passages), analyse critique, réflexion personnelle, structure. Cite la phrase concernée et propose une piste concrète (tu peux proposer une reformulation d'une phrase au plus par point).
## Vérifications automatiques
Commente les résultats fournis (longueur, « This is », tirets, rythme…) en indiquant quoi corriger.
Juge selon cette charte et ces retours :
${STYLE_CHARTER}
${EXAMINER_FEEDBACK}
${CITE}`,
  };
}

// POST { mode: "hints" | "model" | "critique" }
export async function POST(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { id } = await params;
  const { mode } = await request.json();
  if (!["hints", "model", "critique"].includes(mode)) return Response.json({ error: "Mode inconnu" }, { status: 400 });
  try {
    const work = (await q(`select * from works where id = $1`, [Number(id)]))[0];
    if (!work) return Response.json({ error: "Introuvable" }, { status: 404 });
    if (mode === "critique" && !work.answer?.trim()) return Response.json({ error: "Écris d'abord ta réponse." }, { status: 400 });
    const ch = (await q(`select id, title from chapters where id = $1`, [work.chapter_id]))[0];

    const found = await searchPassages(work.question + (mode === "critique" ? `\n${work.answer.slice(0, 1500)}` : ""), { type: "chapter", id: ch.id }, 40);
    const passages = diversify(found, 16, 4);
    const p = prompts(mode, work, ch.title);
    let userText = `QUESTION / CONSIGNE :\n${work.question}`;
    if (mode === "critique") {
      const checks = runChecks(work.answer, { target: work.target_words });
      userText += `\n\nRÉPONSE DE CAMIL :\n${work.answer}\n\nVÉRIFICATIONS AUTOMATIQUES :\n${checks.map((c) => `${c.ok ? "OK" : "À CORRIGER"} : ${c.label}`).join("\n")}`;
    }
    const { blocks, usage } = await callClaudeBlocks({
      model: p.model,
      max_tokens: p.max_tokens,
      system: p.system,
      messages: [{ role: "user", content: [...passages.map(toDocumentBlock), { type: "text", text: userText }] }],
    });
    const { segments } = renderAnswer(blocks, passages);
    const value = { segments, usage, at: new Date().toISOString() };
    await q(`update works set ${mode} = $1, updated_at = now() where id = $2`, [JSON.stringify(value), work.id]);
    return Response.json({ [mode]: value });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
