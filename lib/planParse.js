// Plan collé (par exemple depuis la discussion) -> parties de l'Atelier.
// Reconnaît « 1. Titre (300 mots) », « ## 2) Titre — 250 words », « Partie 3 : Titre »…
// Les lignes qui suivent un titre deviennent le « rôle » de la partie.
export function parsePlan(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const sections = [];
  const HEAD = /^\s*(?:#{1,4}\s*)?(?:partie\s+|part\s+|section\s+)?(\d{1,2})\s*[.):\-–]\s*(.+?)\s*$/i;
  for (const raw of lines) {
    const line = raw.replace(/\*\*/g, "").trimEnd();
    const m = line.match(HEAD);
    // une ligne numérotée courte = un titre ; une ligne numérotée longue dans une partie = du contenu
    if (m && m[2].length <= 140 && (!sections.length || !/[.;:]$/.test(m[2]) || /\(\s*\d+\s*(?:mots|words)/i.test(m[2]))) {
      let title = m[2];
      let words = null;
      const w = title.match(/[(\[—–-]\s*(?:env\.?\s*|~\s*)?(\d{2,5})\s*(?:mots|words)[^)\]]*[)\]]?\s*$/i);
      if (w) {
        words = Number(w[1]);
        title = title.slice(0, w.index).replace(/[\s—–-]+$/, "");
      }
      sections.push({ title: title.trim(), words, brief: "" });
      continue;
    }
    if (!sections.length) continue; // texte avant la première partie : ignoré
    const cur = sections[sections.length - 1];
    if (line.trim() || cur.brief) cur.brief += (cur.brief ? "\n" : "") + line.trim();
  }
  for (const s of sections) s.brief = s.brief.replace(/\n{3,}/g, "\n\n").trim();
  return sections.filter((s) => s.title);
}
