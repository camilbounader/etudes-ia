import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";
import { callClaude, parseJson, MODELS } from "@/lib/anthropic";

export const maxDuration = 60;

// Répétition espacée (boîtes de Leitner) : bonne réponse -> boîte suivante, erreur -> boîte 1
const DAYS = [0, 1, 3, 7, 16, 35];

// PATCH { id, qi, ok } : enregistre le résultat d'une question
export async function PATCH(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { id, qi, ok } = await request.json();
  const row = (await q(`select data from deliverables where id = $1 and kind = 'quiz'`, [Number(id)]))[0];
  if (!row) return Response.json({ error: "Quiz introuvable" }, { status: 404 });
  const data = row.data;
  const prev = data.progress?.[qi] || { box: 0 };
  const box = ok ? Math.min(5, (prev.box || 0) + 1) : 1;
  const due = new Date(Date.now() + DAYS[box] * 86400000).toISOString().slice(0, 10);
  data.progress = { ...(data.progress || {}), [qi]: { box, due, last: new Date().toISOString(), seen: (prev.seen || 0) + 1 } };
  await q(`update deliverables set data = $1 where id = $2`, [JSON.stringify(data), Number(id)]);
  return Response.json({ progress: data.progress });
}

// POST { question, expected, answer } : correction d'une réponse ouverte
export async function POST(request) {
  const denied = await guard();
  if (denied) return denied;
  const { question, expected, answer } = await request.json();
  if (!answer?.trim()) return Response.json({ error: "Écris d'abord ta réponse." }, { status: 400 });
  try {
    const r = await callClaude({
      feature: "quiz : correction",
      model: MODELS.fast,
      max_tokens: 700,
      system: `Tu corriges la réponse d'un étudiant de Master à une question de révision, en français, avec bienveillance mais exigence. Compare-la aux éléments attendus.
Réponds UNIQUEMENT en JSON : {"score":0|1|2,"feedback":"2 à 4 phrases : ce qui est juste, ce qui manque ou est faux, la piste pour compléter"}
score : 2 = l'essentiel y est ; 1 = partiel ; 0 = à côté ou faux.`,
      messages: [{ role: "user", content: `QUESTION : ${question}\n\nÉLÉMENTS ATTENDUS : ${expected}\n\nRÉPONSE DE L'ÉTUDIANT : ${answer}` }],
    });
    const out = parseJson(r.text);
    if (!out) throw new Error("Correction illisible, réessaie.");
    return Response.json(out);
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
