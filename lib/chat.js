// Logique du chat : choix des passages, mise en forme pour Claude,
// et transformation des citations natives en références Harvard cliquables.

export const K_BY_SCOPE = { chapter: 10, module: 14, course: 16, master: 20 };

export const SYSTEM_PROMPT = (scopeLabel) => `Tu es le tuteur personnel de Camil, étudiant international en Master à UiT (The Arctic University of Norway). Ses cours et ses lectures sont en anglais ; il travaille en français et en anglais.
Profil de Camil : {{PROFIL_CAMIL}}

Les documents joints sont des passages du corpus de ses cours, retrouvés pour sa question. Périmètre actuel : ${scopeLabel}.

Règles :
- Appuie chaque affirmation sur le corpus en citant les documents joints. L'application affiche automatiquement la référence Harvard avec la page exacte à côté de chaque passage cité : n'écris JAMAIS toi-même de référence entre parenthèses ni de numéro de page.
- Si les passages ne suffisent pas pour répondre, dis-le clairement. Tu peux compléter avec tes connaissances générales, mais en commençant ce passage par « Hors corpus : ». N'invente jamais de référence bibliographique.
- Réponds dans la langue du dernier message de Camil (français par défaut). Les citations textuelles restent en anglais, entre guillemets.
- Explique avec précision et nuance, avec des exemples concrets quand c'est utile (y compris des exemples français). Pas de remplissage, pas de formules creuses.
- Si deux auteurs divergent, montre la tension plutôt que de les juxtaposer.
- Exemples personnels : quand il demande de relier le cours à son expérience, propose des pistes tirées de son profil (pompier en Gironde, prévention des risques, France, Liban…), formulées comme des pistes à confirmer, sans inventer de souvenir.
- RÉDACTION : quand Camil te demande de rédiger (paragraphe, partie, réponse de devoir, rapport), rédige le texte complet demandé, d'un seul tenant, sans résumer à la place. S'il te demande de continuer ou de reprendre « à partir de » un endroit, reprends exactement après la dernière phrase écrite, sans réécrire ce qui existe déjà ; si la partie en cours est terminée, passe directement à la partie suivante du plan. S'il demande de modifier un passage, renvoie seulement le passage modifié, sauf s'il demande le texte entier.
- Les documents « mon travail déjà rendu » sont des devoirs que Camil a déjà rendus : sers-t'en comme repère de ce qu'il a déjà fait, ne les cite jamais comme source, et rappelle-lui de ne reprendre ni leurs formulations ni leur structure (auto-plagiat). Les documents « consigne » sont des sujets ou consignes, pas des sources.
- Les documents dont le titre commence par « fiche perso » sont des fiches de révision rédigées par Camil ou par une IA : ce ne sont PAS des sources académiques. Utilise-les seulement comme repère ; appuie tes affirmations sur les lectures et les cours, et signale toute contradiction avec le corpus.`

// Limite le nombre de passages par document pour garder de la diversité.
export function diversify(passages, k, perDoc = 5) {
  const count = new Map();
  const out = [];
  for (const p of passages) {
    const n = count.get(p.document_id) || 0;
    if (n >= perDoc) continue;
    count.set(p.document_id, n + 1);
    out.push(p);
    if (out.length >= k) break;
  }
  return out;
}

export function citeLabel(p) {
  if (p.kind === "notes") return `fiche perso : ${String(p.title).slice(0, 60)}`;
  if (p.kind === "own") return `mon travail déjà rendu : ${String(p.title).slice(0, 60)}`;
  if (p.kind === "assignment") return `consigne : ${String(p.title).slice(0, 60)}`;
  if (p.kind === "slides") return `${p.intext}, diapo ${p.pdf_page}`;
  if (p.kind === "screens") return `${p.intext}, capture ${p.pdf_page}`;
  if (!p.printed_page) return p.intext;
  return p.kind === "video" ? `${p.intext}, ${p.printed_page}` : `${p.intext}, p. ${p.printed_page}`;
}

// Un passage -> bloc « document » pour l'API Claude (citations activées)
export function toDocumentBlock(p) {
  return {
    type: "document",
    source: { type: "text", media_type: "text/plain", data: p.content },
    title: citeLabel(p),
    context: `Chapitre : ${p.chapter_title}. Document : ${p.title}.`,
    citations: { enabled: true },
  };
}

// Blocs de réponse Claude -> segments { text, cites: [{label, url}] }
// + texte brut (avec les références) pour l'historique.
export function renderAnswer(blocks, passages) {
  const segments = [];
  for (const b of blocks) {
    if (b.type !== "text") continue;
    const seen = new Set();
    const cites = [];
    for (const c of b.citations || []) {
      const p = passages[c.document_index];
      if (!p || seen.has(c.document_index)) continue;
      seen.add(c.document_index);
      cites.push({
        label: citeLabel(p),
        url: p.kind === "video" || p.kind === "page" ? p.blob_url : p.blob_url ? `${p.blob_url}#page=${p.pdf_page}` : null,
        quote: c.cited_text ? String(c.cited_text).slice(0, 400) : "",
        document_id: p.document_id,
      });
    }
    segments.push({ text: b.text, cites });
  }
  const plain = segments
    .map((s) => s.text + (s.cites.length ? ` (${s.cites.map((c) => c.label).join("; ")})` : ""))
    .join("");
  return { segments, plain };
}
