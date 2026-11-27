// Recherche des références sur internet (Crossref, OpenAlex) quand le PDF
// ne suffit pas : DOI trouvé dans le texte, ou titre à retrouver.
const UA = { "User-Agent": "etudes-ia/1.0 (outil d'étude personnel)" };

const normTitle = (t) =>
  String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// part des mots du titre cherché retrouvés dans le titre candidat (0 à 1)
export function titleSimilarity(a, b) {
  const wa = new Set(normTitle(a).split(" ").filter((w) => w.length > 2));
  const wb = new Set(normTitle(b).split(" ").filter((w) => w.length > 2));
  if (!wa.size || !wb.size) return 0;
  let hit = 0;
  for (const w of wa) if (wb.has(w)) hit++;
  return hit / Math.max(wa.size, Math.min(wb.size, wa.size + 3));
}

export function findDoi(text) {
  const m = String(text || "").match(/\b(10\.\d{4,9}\/[^\s"<>()\]]+[^\s"<>()\].,;])/);
  return m ? m[1] : null;
}

function initialsOf(given) {
  return String(given || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.split("-").map((x) => (x ? x[0].toUpperCase() + "." : "")).join("-"))
    .join(" ");
}

function fromCrossref(m) {
  const type = /chapter/.test(m.type) ? "chapter" : /book|monograph/.test(m.type) ? "book" : /journal|article|proceedings/.test(m.type) ? "article" : "other";
  const people = (m.author?.length ? m.author : m.editor || []).map((a) => ({ family: a.family || a.name || "", initials: initialsOf(a.given) })).filter((a) => a.family);
  const year = (m.issued?.["date-parts"]?.[0]?.[0] || m.published?.["date-parts"]?.[0]?.[0] || "").toString();
  return {
    type,
    authors: people,
    editors_only: !m.author?.length && !!m.editor?.length,
    year,
    title: (m.title || [])[0] || "",
    container: (m["container-title"] || [])[0] || "",
    book_editors: type === "chapter" ? (m.editor || []).map((e) => `${e.family}, ${initialsOf(e.given)}`).join(" and ") : "",
    volume: m.volume || "",
    issue: m.issue || "",
    pages: m.page ? String(m.page).replace("-", "–") : "",
    publisher: m.publisher || "",
    place: m["publisher-location"] || "",
    doi: m.DOI || "",
    url: "",
    source: "crossref",
  };
}

export async function lookupDoi(doi) {
  try {
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { headers: UA, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return fromCrossref((await res.json()).message);
  } catch {
    return null;
  }
}

// Titre (et éventuellement auteur) -> meilleure correspondance Crossref, si elle est sûre
export async function lookupTitle(title, author = "") {
  if (!title || normTitle(title).split(" ").length < 3) return null;
  try {
    const url = new URL("https://api.crossref.org/works");
    url.searchParams.set("query.bibliographic", `${title} ${author}`.trim());
    url.searchParams.set("rows", "5");
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const items = (await res.json()).message?.items || [];
    let best = null;
    for (const it of items) {
      const sim = titleSimilarity(title, (it.title || [])[0]);
      if (sim >= 0.8 && (!best || sim > best.sim)) best = { sim, it };
    }
    return best ? fromCrossref(best.it) : null;
  } catch {
    return null;
  }
}

// Texte intégral gratuit d'un DOI (OpenAlex), s'il existe
export async function openAccessPdf(doi) {
  try {
    const res = await fetch(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`, { headers: UA, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const w = await res.json();
    return w.best_oa_location?.pdf_url || w.open_access?.oa_url || null;
  } catch {
    return null;
  }
}
