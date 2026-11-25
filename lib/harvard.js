// Mise en forme Harvard (style « Cite Them Right », le plus courant).
// Les deux textes produits restent modifiables à la main dans l'application.

function familyNames(authors = []) {
  return authors.map((a) => a.family).filter(Boolean);
}

export function harvardInText(meta = {}) {
  const fam = familyNames(meta.authors);
  const year = meta.year || "n.d.";
  let who;
  if (fam.length === 0) who = meta.title ? shortTitle(meta.title) : "Anon.";
  else if (fam.length === 1) who = fam[0];
  else if (fam.length === 2) who = `${fam[0]} and ${fam[1]}`;
  else who = `${fam[0]} et al.`;
  return `${who}, ${year}`;
}

function shortTitle(t) {
  const words = String(t).split(/\s+/);
  return words.length > 5 ? words.slice(0, 5).join(" ") + "…" : t;
}

function authorList(authors = []) {
  const parts = authors
    .filter((a) => a.family)
    .map((a) => (a.initials ? `${a.family}, ${a.initials}` : a.family));
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
}

export function harvardReference(meta = {}) {
  const authors = authorList(meta.authors);
  const eds = meta.editors_only ? " (eds)" : "";
  const year = meta.year || "n.d.";
  const title = meta.title || "Sans titre";
  const pages = meta.pages ? `, pp. ${meta.pages}` : "";
  const doi = meta.doi ? ` doi: ${meta.doi}.` : meta.url ? ` Available at: ${meta.url}.` : "";

  switch (meta.type) {
    case "article": {
      const vol = meta.volume ? `, ${meta.volume}` : "";
      const iss = meta.issue ? `(${meta.issue})` : "";
      return `${authors}${eds} (${year}) '${title}', ${meta.container || ""}${vol}${iss}${pages}.${doi}`.trim();
    }
    case "chapter":
      return `${authors} (${year}) '${title}', in ${meta.book_editors ? meta.book_editors + " (eds) " : ""}${meta.container || ""}. ${publisherPart(meta)}${pages}.${doi}`.trim();
    case "book":
      return `${authors}${eds} (${year}) ${title}. ${publisherPart(meta)}.${doi}`.trim();
    case "web":
      return `${authors || meta.container || "Anon."} (${year}) ${title}. Available at: ${meta.url || ""} (Accessed: ${meta.accessed || ""}).`.trim();
    default:
      return `${authors}${eds} (${year}) ${title}. ${publisherPart(meta)}.${doi}`.trim();
  }
}

function publisherPart(meta) {
  if (meta.place && meta.publisher) return `${meta.place}: ${meta.publisher}`;
  return meta.publisher || "";
}

// ---------- APA 7 (recommandé par certains examens UiT) ----------
function apaAuthors(authors = []) {
  const parts = authors.filter((a) => a.family).map((a) => (a.initials ? `${a.family}, ${a.initials}` : a.family));
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length <= 20) return parts.slice(0, -1).join(", ") + ", & " + parts[parts.length - 1];
  return parts.slice(0, 19).join(", ") + ", … " + parts[parts.length - 1];
}
const doiUrl = (doi) => (doi ? (String(doi).startsWith("http") ? doi : `https://doi.org/${doi}`) : "");

export function apaReference(meta = {}) {
  const authors = apaAuthors(meta.authors);
  const eds = meta.editors_only ? (meta.authors?.length > 1 ? " (Eds.)" : " (Ed.)") : "";
  const year = meta.year || "n.d.";
  const title = meta.title || "Untitled";
  const link = meta.doi ? ` ${doiUrl(meta.doi)}` : meta.url ? ` ${meta.url}` : "";
  switch (meta.type) {
    case "article": {
      const vol = meta.volume ? `, ${meta.volume}` : "";
      const iss = meta.issue ? `(${meta.issue})` : "";
      const pages = meta.pages ? `, ${meta.pages}` : "";
      return `${authors} (${year}). ${title}. ${meta.container || ""}${vol}${iss}${pages}.${link}`.trim();
    }
    case "chapter":
      return `${authors} (${year}). ${title}. In ${meta.book_editors ? meta.book_editors + " (Eds.), " : ""}${meta.container || ""}${meta.pages ? ` (pp. ${meta.pages})` : ""}. ${meta.publisher || ""}.${link}`.trim();
    case "web":
      return `${authors || meta.container || "Anon."} (${year}). ${title}. ${meta.container && authors ? meta.container + ". " : ""}${meta.url || ""}`.trim();
    default:
      return `${authors}${eds} (${year}). ${title}. ${meta.publisher || ""}.${link}`.trim();
  }
}
