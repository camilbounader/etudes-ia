import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";
import { searchPassages } from "@/lib/search";
import { scopeInfo } from "@/lib/scope";
import { callClaude, callClaudeBlocks, MODELS } from "@/lib/anthropic";
import { K_BY_SCOPE, SYSTEM_PROMPT, diversify, toDocumentBlock, renderAnswer } from "@/lib/chat";

export const maxDuration = 300;

// POST { conversationId, message } : une question, une réponse citée.
export async function POST(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { conversationId, message, oral } = await request.json();
  if (!message?.trim()) return Response.json({ error: "Message vide" }, { status: 400 });

  try {
    const conv = (await q(`select * from conversations where id = $1`, [Number(conversationId)]))[0];
    if (!conv) return Response.json({ error: "Conversation introuvable" }, { status: 404 });
    const scope = await scopeInfo(conv.scope_type, conv.scope_id);
    const history = await q(
      `select role, content from messages where conversation_id = $1 order by id desc limit 12`,
      [conv.id]
    );
    history.reverse();
    // l'API exige que l'historique commence par un message de Camil
    while (history.length && history[0].role !== "user") history.shift();

    // Recherche : une question courte est complétée par la précédente
    const lastUser = [...history].reverse().find((m) => m.role === "user");
    const query = message.length < 60 && lastUser ? `${lastUser.content}\n${message}` : message;
    const k = K_BY_SCOPE[conv.scope_type] || 12;
    const found = await searchPassages(query, { type: conv.scope_type, id: conv.scope_id }, k * 2);
    const passages = diversify(found, k);

    const messages = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      {
        role: "user",
        content: [
          ...passages.map(toDocumentBlock),
          {
            type: "text",
            text: passages.length
              ? message
              : `${message}\n\n(Aucun passage du corpus n'a été trouvé dans ce périmètre.)`,
          },
        ],
      },
    ];

    const system =
      SYSTEM_PROMPT(scope?.label || "inconnu") +
      (oral
        ? "\n\nMODE ORAL : la réponse sera lue à voix haute. Réponds en 150 mots maximum, phrases simples, sans titres, listes ni tableaux. Termine par une question courte pour poursuivre l'échange."
        : "");
    // Réponse longue : si elle est coupée par la limite de longueur, on demande
    // automatiquement la suite (jusqu'à 2 fois, tant qu'il reste du temps).
    const started = Date.now();
    let blocks = [];
    let usage = null;
    let truncated = false;
    let convo = messages;
    for (let round = 0; round < 3; round++) {
      const r = await callClaudeBlocks({ feature: "chat", model: MODELS.main, system, messages: convo, max_tokens: oral ? 1200 : 8000 });
      blocks = blocks.concat(r.blocks);
      usage = usage
        ? { ...usage, input_tokens: usage.input_tokens + r.usage.input_tokens, output_tokens: usage.output_tokens + r.usage.output_tokens }
        : r.usage;
      truncated = r.stop === "max_tokens";
      if (!truncated || Date.now() - started > 150000) break;
      const soFar = blocks.filter((b) => b.type === "text").map((b) => b.text).join("");
      convo = [
        ...messages,
        { role: "assistant", content: soFar },
        { role: "user", content: "Ta réponse a été coupée par la limite de longueur. Continue EXACTEMENT là où tu t'es arrêté (même au milieu d'une phrase), sans rien répéter ni annoncer que tu continues." },
      ];
    }
    const { segments, plain } = renderAnswer(blocks, passages);

    await q(`insert into messages (conversation_id, role, content) values ($1, 'user', $2)`, [conv.id, message]);
    const saved = await q(
      `insert into messages (conversation_id, role, content, citations) values ($1, 'assistant', $2, $3) returning id, created_at`,
      [conv.id, plain, JSON.stringify({ segments, usage, truncated })]
    );

    // Titre automatique après le premier échange
    let title = conv.title;
    if (!history.length && (!conv.title || conv.title === "Nouvelle conversation")) {
      try {
        const r = await callClaude({
          feature: "titre de conversation",
          model: MODELS.fast,
          max_tokens: 40,
          system: "Donne un titre de 3 à 7 mots, en français, à cette conversation d'étude. Réponds uniquement par le titre, sans guillemets.",
          messages: [{ role: "user", content: message }],
        });
        title = r.text.trim().replace(/^["«]|["»]$/g, "").slice(0, 80) || title;
        await q(`update conversations set title = $1 where id = $2`, [title, conv.id]);
      } catch {}
    }

    return Response.json({
      message: { id: saved[0].id, role: "assistant", content: plain, citations: { segments, usage, truncated } },
      title,
      passagesUsed: passages.length,
    });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
