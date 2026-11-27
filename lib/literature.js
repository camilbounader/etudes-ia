import { callClaude, parseJson, MODELS } from "@/lib/anthropic";
import { harvardInText, harvardReference, apaReference } from "@/lib/harvard";
import { rulesText, materialsText, chatText } from "@/lib/atelier";

// Littérature hors pensum : recherche RÉELLE dans OpenAlex (base ouverte de
// ~250 millions de publications), puis tri par Claude. Aucune référence
// n'est inventée : titre, auteurs, revue, année et DOI viennent d'OpenAlex.

const SELECT = "id,doi,title,publication_year,authorships,primary_location,cited_by_count,abstract_inverted_index,open_access,type,biblio";

function abstractOf(inv) {
  if (!inv) return "";
  const words = [];
  for (const [w, pos] of Object.entries(inv)) for (const p of pos) words[p] = w;
  return words.filter(Boolean).join(" ");
}

function initials(name) {
  const parts = String(name).trim().split(/\s+/);
  const family = parts.pop() || "";
  return { family, initials: parts.map((p) => p.replace(/[^A-Za-zÀ-ÿ-]/g, "").split("-").map((x) => (x ? x[0].toUpperCase() + "." : "")).join("-")).join(" ") };
}

async function openalex(query, fromYear) {
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("search", query);
  url.searchParams.set("per_page", "15");
  url.searchParams.set("filter", `has_abstract:true,publication_year:>${fromYear - 1},type:article|book|book-chapter|review`);
  url.searchParams.set("select", SELECT);
  if (process.env.OPENALEX_MAILTO) url.searchParams.set("mailto", process.env.OPENALEX_MAILTO);
  const res = await fetch(url, { headers: { "User-Agent": "etudes-ia (student study tool)" } });
  if (!res.ok) throw new Error(`OpenAlex ${res.status}`);
  return (await res.json()).results || [];
}

export function toItem(w) {
  const authors = (w.authorships || []).map((a) => initials(a.author?.display_name || "")).filter((a) => a.family);
  const venue = w.primary_location?.source?.display_name || "";
  const type = w.type === "book" ? "book" : w.type === "book-chapter" ? "chapter" : "article";
  const doi = w.doi ? w.doi.replace(/^https?:\/\/doi\.org\//, "") : "";
  const b = w.biblio || {};
  const meta = {
    type,
    authors,
    year: w.publication_year ? String(w.publication_year) : "",
    title: w.title || "",
    container: venue,
    volume: b.volume || "",
    issue: b.issue || "",
    pages: b.first_page ? `${b.first_page}${b.last_page ? `–${b.last_page}` : ""}` : "",
    doi,
    publisher: type === "book" ? venue : "",
  };
  return {
    id: String(w.id).split("/").pop(),
    title: w.title,
    year: w.publication_year,
    venue,
    authors: authors.map((a) => `${a.family}${a.initials ? `, ${a.initials}` : ""}`),
    doi,
    url: w.doi || w.id,
    oa_url: w.open_access?.oa_url || null,
    cited: w.cited_by_count || 0,
    abstract: abstractOf(w.abstract_inverted_index).slice(0, 1500),
    intext: harvardInText(meta),
    reference: harvardReference(meta),
    apa: apaReference(meta),
    metadata: meta,
  };
}

export async function findLiterature(a, docs) {
  const context = `ASSIGNMENT:\n${(a.brief || "").slice(0, 5000)}\n\nRULES: ${rulesText(a.rules)}\nCHOSEN ANGLE: ${a.thesis || "not chosen yet"}\n\n${chatText(a, 2500) ? `DISCUSSION (end):\n${chatText(a, 2500)}\n\n` : ""}${materialsText(a, 2500) ? `CAMIL'S NOTES (extract):\n${materialsText(a, 2500)}` : ""}`;
  const r1 = await callClaude({
    feature: "atelier : littérature (requêtes)",
    model: MODELS.fast,
    max_tokens: 600,
    system: `You prepare a literature search in an academic database for a Master's assignment (crisis, emergency and risk management; qualitative methods). Write 5 short English search queries (3 to 7 words each) using the scholarly terms authors would use, covering the topic, the chosen angle and the methods. Answer ONLY with JSON: {"queries":["…"]}`,
    messages: [{ role: "user", content: context }],
  });
  const queries = (parseJson(r1.text)?.queries || []).slice(0, 5);
  if (!queries.length) throw new Error("Requêtes de recherche introuvables : réessaie.");

  const seen = new Map();
  const pensum = new Set(docs.map((d) => String(d.title || "").toLowerCase().slice(0, 40)));
  for (const qy of queries) {
    for (const w of await openalex(qy, 2000).catch(() => [])) {
      if (!w.title || seen.has(w.id)) continue;
      const it = toItem(w);
      if (!it.abstract || [...pensum].some((t) => t && it.title.toLowerCase().startsWith(t.slice(0, 30)))) continue;
      seen.set(w.id, it);
    }
  }
  const candidates = [...seen.values()].sort((x, y) => y.cited - x.cited).slice(0, 45);
  if (!candidates.length) throw new Error("La base OpenAlex n'a rien renvoyé (ou n'est pas joignable) : réessaie dans un moment.");

  const r2 = await callClaude({
    feature: "atelier : littérature (choix)",
    model: MODELS.main,
    max_tokens: 4000,
    system: `Tu choisis de la littérature HORS PENSUM pour un devoir de Master de Camil (la grille de notation donne un bonus à « awareness of the broader academic literature »). Parmi les candidats fournis (vraies publications issues d'une base de données), garde les 6 à 10 plus utiles : directement liées au sujet et à l'angle, sérieuses (revues à comité de lecture, ouvrages de référence), de préférence citées ou récentes, et variées (théorie, méthode, cas empiriques ; si possible un cas français, nordique ou méditerranéen).
Réponds UNIQUEMENT en JSON : {"picks":[{"id":"identifiant exact","why":"en français, 1 phrase : ce que la publication apporte","use":"en français, 1 phrase : où et comment l'utiliser dans le devoir"}]}
N'utilise que les identifiants fournis. Ne résume que ce que dit le résumé fourni.`,
    messages: [{ role: "user", content: `${context}\n\nCANDIDATES:\n${JSON.stringify(candidates.map((c) => ({ id: c.id, title: c.title, year: c.year, venue: c.venue, authors: c.authors.slice(0, 4), cited: c.cited, abstract: c.abstract.slice(0, 700) })))}` }],
  });
  const picks = parseJson(r2.text)?.picks || [];
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const items = picks.map((p) => byId.get(p.id) && { ...byId.get(p.id), why: p.why || "", use: p.use || "" }).filter(Boolean);
  return { at: new Date().toISOString(), queries, items };
}

// Recherche rapide pour le chat : quelques vraies publications (résumé + référence)
export async function quickLiterature(question, n = 6) {
  const r = await callClaude({
    feature: "chat : recherche hors pensum",
    model: MODELS.fast,
    max_tokens: 200,
    system: `Write 2 short English academic search queries (3 to 7 words each) to find scholarly literature answering this student's question (crisis, emergency and risk management, social science methods). Answer ONLY with JSON: {"queries":["…","…"]}`,
    messages: [{ role: "user", content: question.slice(0, 3000) }],
  });
  const queries = (parseJson(r.text)?.queries || []).slice(0, 2);
  const seen = new Map();
  for (const qy of queries) {
    for (const w of await openalex(qy, 1990).catch(() => [])) {
      if (!w.title || seen.has(w.id)) continue;
      const it = toItem(w);
      if (it.abstract) seen.set(w.id, it);
    }
  }
  return [...seen.values()].slice(0, n);
}
