// Vérification de faits sur le web (outil de recherche web de l'API Claude).
// Environ 1 centime par recherche ; limité à quelques recherches par réponse.
export const WEB_TOOL = [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }];

export const WEB_RULE = `VÉRIFICATION SUR LE WEB : tu disposes d'une recherche web (3 recherches au plus). Utilise-la seulement pour vérifier un fait précis qui n'est pas dans le corpus (événement, date, chiffre, discours, loi, organisation) quand Camil le cite ou quand tu en as besoin. Ne t'en sers jamais pour remplacer le corpus ni pour trouver des citations académiques. Si une source officielle confirme le fait, dis-le en citant la page ; si rien ne le confirme, dis-le clairement.`;

// Appel avec recherche web : gère la pause éventuelle de l'API (pause_turn)
let disabledUntil = 0;
export async function callWithWeb(callClaudeBlocks, args) {
  // recherche web refusée (non activée sur le compte Anthropic…) : on répond sans elle
  if (Date.now() < disabledUntil) return callClaudeBlocks(args);
  try {
    return await withWeb(callClaudeBlocks, args);
  } catch (err) {
    if (!/web.?search|tool|not enabled|permission/i.test(String(err.message || err))) throw err;
    disabledUntil = Date.now() + 10 * 60 * 1000;
    return callClaudeBlocks(args);
  }
}

async function withWeb(callClaudeBlocks, args) {
  let messages = args.messages;
  let blocks = [];
  let last = null;
  for (let i = 0; i < 3; i++) {
    last = await callClaudeBlocks({ ...args, messages, tools: WEB_TOOL });
    blocks = blocks.concat(last.blocks);
    if (last.stop !== "pause_turn") break;
    messages = [...messages, { role: "assistant", content: last.blocks }];
  }
  return { blocks, usage: last.usage, stop: last.stop };
}
