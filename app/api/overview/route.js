import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";
import { scopeInfo } from "@/lib/scope";
import { structureText } from "@/lib/structure";
import { searchPassages } from "@/lib/search";
import { callClaudeBlocks, MODELS } from "@/lib/anthropic";
import { diversify, toDocumentBlock, renderAnswer } from "@/lib/chat";

export const maxDuration = 300;

const K = { chapter: 14, module: 18, course: 20, master: 24 };

const SYSTEM = `Tu rédiges des fiches d'aperçu pour Camil, étudiant international en Master à UiT (Norvège), cours en anglais, qui travaille en français.
Une fiche d'aperçu sert à dégrossir un chapitre, un module, un cours ou tout le master avant de s'y plonger, et à le relier au reste.
Elle est COURTE : 300 à 450 mots, en français, avec exactement ces sections (titres en ## ) :
## De quoi il s'agit
3 ou 4 phrases : la question centrale et pourquoi elle compte.
## Idées et auteurs clés
4 à 6 puces, chacune appuyée sur le corpus.
## Liens avec le reste du master
2 à 4 puces qui nomment précisément d'autres chapitres, modules ou cours du plan fourni et expliquent le lien (continuité, opposition, application).
## Comment l'aborder
3 à 5 conseils d'apprentissage concrets : ordre de lecture (lectures obligatoires d'abord si c'est indiqué), ce qui est central ou secondaire, une ou deux questions à garder en tête, un exercice rapide (ex. : expliquer un concept avec un exemple français ou de son expérience).
Règles : cite le corpus avec les documents fournis (l'application ajoute la référence et la page ; n'écris jamais de référence toi-même). Ce qui vient de tes connaissances générales commence par « Hors corpus : ». Pas de remplissage.`;

// GET ?scopeType&scopeId : dernier aperçu
export async function GET(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const sp = new URL(request.url).searchParams;
  const type = sp.get("scopeType") || "master";
  const id = type === "master" ? null : Number(sp.get("scopeId"));
  const rows = await q(
    `select id, content, citations, created_at from overviews
      where scope_type = $1 and scope_id is not distinct from $2 order by id desc limit 1`,
    [type, id]
  );
  return Response.json({ overview: rows[0] || null });
}

// POST { scopeType, scopeId } : génère (ou regénère) l'aperçu
export async function POST(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { scopeType = "master", scopeId } = await request.json();
  const id = scopeType === "master" ? null : Number(scopeId);
  try {
    const scope = await scopeInfo(scopeType, id);
    if (!scope) return Response.json({ error: "Périmètre introuvable" }, { status: 404 });
    const plan = await structureText({ type: scopeType, id });
    const query = `${scope.label}. Main concepts, arguments and authors.`;
    const found = await searchPassages(query, { type: scopeType, id }, (K[scopeType] || 16) * 3);
    const passages = diversify(found, K[scopeType] || 16, scopeType === "chapter" ? 4 : 2);
    if (!passages.length) {
      return Response.json({ error: "Aucun document importé dans ce périmètre : importe d'abord des lectures." }, { status: 400 });
    }

    const { blocks, stop } = await callClaudeBlocks({
      feature: "aperçu",
      model: MODELS.main,
      system: SYSTEM,
      max_tokens: 5000,
      messages: [
        {
          role: "user",
          content: [
            ...passages.map(toDocumentBlock),
            {
              type: "text",
              text: `Périmètre : ${scope.label}\n\nPlan du master (pour les liens) :\n${plan}\n\nRédige la fiche d'aperçu de ce périmètre.`,
            },
          ],
        },
      ],
    });
    const { segments, plain } = renderAnswer(blocks, passages);
    if (stop === "max_tokens") {
      return Response.json({ error: "L'aperçu a été coupé avant la fin. Clique de nouveau sur « Regénérer »." }, { status: 500 });
    }
    const r = await q(
      `insert into overviews (scope_type, scope_id, content, citations) values ($1, $2, $3, $4) returning id, created_at`,
      [scopeType, id, plain, JSON.stringify({ segments })]
    );
    return Response.json({ overview: { id: r[0].id, content: plain, citations: { segments }, created_at: r[0].created_at } });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
