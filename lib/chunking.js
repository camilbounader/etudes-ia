// Nettoyage du texte d'une page et découpage en passages.
// Un passage ne dépasse jamais une page : chaque citation garde ainsi son
// numéro de page exact.

export function cleanPageText(text) {
  return String(text || "")
    .replace(/­/g, "") // tirets conditionnels
    .replace(/(\w)-\n(\w)/g, "$1$2") // mots coupés en fin de ligne
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function chunkPage(text, size = 1200, overlap = 200) {
  const clean = cleanPageText(text).replace(/\n+/g, " ");
  if (clean.length < 40) return [];
  if (clean.length <= size) return [clean];

  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      // couper de préférence à la fin d'une phrase
      const window = clean.slice(start + size * 0.6, end);
      const lastStop = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "));
      if (lastStop > -1) end = start + Math.floor(size * 0.6) + lastStop + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks.filter((c) => c.length >= 40);
}

// Un passage de bibliographie : beaucoup de « Nom, I. » ou de liens DOI.
// (Les citations dans le texte, « Kolar, 2011 », n'ont pas d'initiales.)
// Il est gardé dans la base mais exclu de la recherche.
export function chunkKind(text) {
  const t = String(text);
  const initials = (t.match(/[A-Z][A-Za-z\u00C0-\u017F'\-]+,\s(?:[A-Z]\.\s?){1,3}/g) || []).length;
  const links = (t.match(/doi\.org|doi:|https?:\/\//gi) || []).length;
  // style « Mallak, Larry A. 1998. Measuring… » (Springer, Chicago)
  const yearDot = (t.match(/\b(19|20)\d{2}[a-z]?\.\s/g) || []).length;
  return initials >= 4 || links >= 3 || yearDot >= 4 ? "refs" : "text";
}
