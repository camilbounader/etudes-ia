// Repère les citations Harvard dans un texte rédigé par Camil :
// « (Bergström, 2018, p. 33) », « (Copeland et al., 2020, pp. 2-3) »,
// « Chandler (2020, p. 199) », « (Barnett and O'Neill, 2010; Duchek, 2020, p. 230) ».

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");

export function extractCitations(text) {
  const out = [];
  const t = String(text || "");
  // entre parenthèses, éventuellement plusieurs séparées par « ; »
  for (const m of t.matchAll(/\(([^()]*?\b(?:19|20)\d{2}[a-z]?[^()]*)\)/g)) {
    for (const part of m[1].split(";")) {
      const c = part.match(/^\s*([^,()]+?),?\s+((?:19|20)\d{2}[a-z]?)(?:\s*,\s*(pp?\.\s*[\d\s–-]+))?/);
      if (c) out.push({ raw: part.trim(), author: c[1].trim(), year: c[2], page: c[3] ? c[3].trim() : null });
    }
  }
  // narratives : Auteur (2020, p. 12)
  for (const m of t.matchAll(/([A-Z][A-Za-zÀ-ÿ'’-]+(?:\s+(?:and|&)\s+[A-Z][A-Za-zÀ-ÿ'’-]+|\s+et al\.)?)\s+\(((?:19|20)\d{2}[a-z]?)(?:\s*,\s*(pp?\.\s*[\d\s–-]+))?\)/g)) {
    out.push({ raw: m[0], author: m[1], year: m[2], page: m[3] || null });
  }
  return out;
}

// Rapproche une citation d'un document de la base (« Bergström, 2018 »)
export function matchDocument(cite, docs) {
  const a = norm(cite.author.replace(/\bet al\.?/i, "").split(/\s+(?:and|&)\s+/)[0]);
  return docs.find((d) => {
    const m = String(d.intext || "").match(/^(.*?),\s*((?:19|20)\d{2}[a-z]?|n\.d\.)$/);
    if (!m) return false;
    const da = norm(m[1].replace(/\bet al\.?/i, "").split(/\s+and\s+/)[0]);
    return m[2] === cite.year && da && (da === a || da.startsWith(a) || a.startsWith(da));
  });
}
