import { searchPassages } from "@/lib/search";
import { chapterPassages } from "@/lib/sheetGen";
import { diversify, citeLabel } from "@/lib/chat";
import { scopeInfo } from "@/lib/scope";
import { structureText } from "@/lib/structure";
import { callClaude, parseJson, MODELS } from "@/lib/anthropic";

// Livrables d'apprentissage : carte mentale, comparatif des auteurs, banque de citations.
// Claude reçoit des passages numérotés [P1]… et renvoie du JSON qui y renvoie ;
// l'application transforme ces numéros en références (Auteur, année, p. X) cliquables.

export const KINDS = {
  mindmap: "Carte mentale",
  authors: "Comparatif des auteurs",
  quotes: "Banque de citations",
  quiz: "Quiz",
  videos: "Vidéos en français",
};

const MAX_PASSAGES = 70;

export function passageUrl(p) {
  if (p.kind === "video" || p.kind === "page") return p.blob_url || null;
  return p.blob_url ? `${p.blob_url}#page=${p.pdf_page}` : null;
}

async function gather(type, id) {
  if (type === "chapter") {
    const { passages } = await chapterPassages(id);
    if (passages.length <= MAX_PASSAGES) return passages;
    const step = passages.length / MAX_PASSAGES; // échantillon régulier : tout le chapitre reste couvert
    return Array.from({ length: MAX_PASSAGES }, (_, i) => passages[Math.floor(i * step)]);
  }
  const scope = await scopeInfo(type, id);
  const found = await searchPassages(`${scope.label}. Key concepts, authors, theories, arguments and debates.`, { type, id }, 300);
  return diversify(found, MAX_PASSAGES, type === "module" ? 8 : 5).filter((p) => !["notes", "own", "assignment"].includes(p.kind));
}

const COMMON = `Tu travailles pour Camil, étudiant international en Master (UiT, Norvège ; cours en anglais, il travaille en français).
Tu reçois des passages numérotés [P1], [P2]… issus de son corpus. Appuie CHAQUE élément sur un ou plusieurs passages en donnant leurs numéros dans "sources" (nombres entiers). N'invente rien hors corpus. Garde les termes techniques anglais entre parenthèses quand ils sont utiles pour l'examen.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans bloc de code.`;

const PROMPTS = {
  mindmap: `${COMMON}
Construis une CARTE MENTALE du périmètre, en français :
{"center":"idée centrale en 3 à 8 mots",
 "branches":[{"label":"concept (2 à 6 mots)","note":"1 ou 2 phrases claires qui expliquent","sources":[1,4],
   "children":[{"label":"…","note":"…","sources":[2],"children":[…]}]}],
 "links":[{"from":"label exact d'un nœud","to":"label exact d'un autre nœud","type":"s'oppose à | prolonge | illustre | cause | nuance","note":"une phrase","sources":[3]}]}
4 à 7 branches principales, 2 à 5 enfants chacune, 3 niveaux au maximum. 3 à 8 liens transversaux entre des nœuds de branches DIFFÉRENTES : ce sont eux qui montrent comment les idées et les auteurs se répondent.`,
  authors: `${COMMON}
Construis un TABLEAU COMPARATIF DES AUTEURS du périmètre, en français, pour aider à confronter les auteurs dans un essai :
{"rows":[{"author":"Nom(s), année","concept":"concept clé (terme anglais)","thesis":"thèse en 1 ou 2 phrases","method":"méthode ou type de démonstration, en quelques mots","agrees":"avec qui il converge et sur quoi","disagrees":"avec qui il diverge ou ce qu'il nuance","use":"comment le mobiliser dans un essai, en une phrase","sources":[1,5]}],
 "synthesis":"2 ou 3 phrases : les grandes lignes de fracture entre ces auteurs"}
Une ligne par auteur ou texte du corpus (pas les cours ni les diapos de l'enseignant, sauf s'ils portent une thèse propre). "agrees" et "disagrees" doivent nommer d'autres auteurs du tableau quand c'est possible ; écris "—" si rien dans le corpus.`,
  quotes: `${COMMON}
Construis une BANQUE DE CITATIONS pour les essais (en anglais, langue des examens) :
{"concepts":[{"concept":"concept (anglais) — explication courte en français","quotes":[{"text":"citation EXACTE, mot pour mot","source":7,"use":"en français : à quoi elle sert dans un essai (définir, prouver, nuancer, critiquer…)"}]}]}
5 à 10 concepts, 2 à 4 citations chacun. Chaque citation : 8 à 35 mots, recopiée EXACTEMENT depuis UN seul passage (même ponctuation, sans couper un mot), donné dans "source". Préfère les phrases qui définissent, affirment une thèse ou donnent un résultat, pas les phrases de transition. Varie les auteurs.`,
  quiz: `${COMMON}
Construis un QUIZ DE RÉVISION en français (termes techniques anglais entre parenthèses) qui teste la COMPRÉHENSION, pas la mémoire des détails :
{"questions":[
 {"type":"mcq","q":"question","choices":["…","…","…","…"],"answer":0,"explain":"pourquoi c'est la bonne réponse et pourquoi les autres sont fausses, en 2 ou 3 phrases","sources":[3]},
 {"type":"open","q":"question d'analyse (expliquer, comparer, appliquer à un cas)","answer":"les 3 à 5 éléments attendus dans une bonne réponse","sources":[2,8]}]}
12 questions : 8 QCM et 4 questions ouvertes, couvrant tous les auteurs et idées clés. QCM : 4 choix plausibles, une seule bonne réponse ("answer" = son indice, de 0 à 3), varie la position de la bonne réponse. Au moins 2 questions ouvertes demandent d'appliquer un concept à un cas concret (France, Norvège, gestion de crise, secours).`,
};

function norm(t) {
  return String(t || "")
    .replace(/-\s*\n\s*/g, "")
    .replace(/[‘’‛`´]/g, "'")
    .replace(/[“”„«»]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function refsOf(nums, passages) {
  const out = [];
  const seen = new Set();
  for (const n of Array.isArray(nums) ? nums : [nums]) {
    const p = passages[Number(n) - 1];
    if (!p) continue;
    const label = citeLabel(p);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ label, url: passageUrl(p), document_id: p.document_id });
  }
  return out;
}

function resolveTree(node, passages) {
  if (!node || typeof node !== "object") return null;
  return {
    label: String(node.label || "").slice(0, 120),
    note: String(node.note || ""),
    refs: refsOf(node.sources, passages),
    children: (node.children || []).map((c) => resolveTree(c, passages)).filter(Boolean),
  };
}

// ---------- Vidéos YouTube en français (recherche réelle, aucune vidéo inventée) ----------
function isoMinutes(iso) {
  const m = String(iso || "").match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? (Number(m[1] || 0) * 60 + Number(m[2] || 0) + Number(m[3] || 0) / 60) : 0;
}

async function youtube(path, params) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY manquante dans Vercel : voir les étapes dans la page Livrables, onglet Vidéos.");
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [k, v] of Object.entries({ ...params, key })) url.searchParams.set(k, v);
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(`YouTube ${res.status} : ${data.error?.message || "erreur"}`);
  return data;
}

async function generateVideos(scope, passages) {
  const sample = passages.slice(0, 40).map((p, i) => `[P${i + 1}] ${p.content.slice(0, 500)}`).join("\n\n");
  const r1 = await callClaude({
    feature: "livrable : vidéos (concepts)",
    model: MODELS.fast,
    max_tokens: 1200,
    system: `À partir d'extraits de cours de Master, choisis les 4 concepts les plus importants à illustrer par une vidéo de vulgarisation en FRANÇAIS. Pour chacun, écris une requête YouTube courte en français (3 à 6 mots, termes que des vidéos françaises utiliseraient). Réponds UNIQUEMENT en JSON : {"concepts":[{"concept":"nom (anglais) — explication courte","query":"requête en français"}]}`,
    messages: [{ role: "user", content: `${scope.label}\n\n${sample}` }],
  });
  const concepts = (parseJson(r1.text)?.concepts || []).slice(0, 4);
  if (!concepts.length) throw new Error("Concepts introuvables : réessaie.");
  const lists = [];
  for (const c of concepts) {
    const search = await youtube("search", { part: "snippet", q: c.query, type: "video", maxResults: "10", relevanceLanguage: "fr", regionCode: "FR", safeSearch: "strict" });
    const ids = (search.items || []).map((x) => x.id?.videoId).filter(Boolean);
    if (!ids.length) { lists.push({ ...c, candidates: [] }); continue; }
    const details = await youtube("videos", { part: "snippet,statistics,contentDetails", id: ids.join(",") });
    const candidates = (details.items || [])
      .map((v) => ({
        id: v.id,
        title: v.snippet.title,
        channel: v.snippet.channelTitle,
        lang: v.snippet.defaultAudioLanguage || v.snippet.defaultLanguage || "",
        views: Number(v.statistics?.viewCount || 0),
        minutes: Math.round(isoMinutes(v.contentDetails?.duration)),
        year: (v.snippet.publishedAt || "").slice(0, 4),
        description: (v.snippet.description || "").slice(0, 200),
      }))
      .filter((v) => v.minutes >= 2 && v.minutes <= 60);
    lists.push({ ...c, candidates });
  }
  const r2 = await callClaude({
    feature: "livrable : vidéos (choix)",
    model: MODELS.fast,
    max_tokens: 2500,
    system: `Tu choisis des vidéos YouTube pour un étudiant français en Master. Pour chaque concept, garde au plus 2 vidéos de la liste fournie (identifiants exacts), en français, sérieuses (chaînes de vulgarisation connues, médias, institutions, universités), pertinentes pour le concept, de préférence très vues. Écarte les vidéos hors sujet, en langue étrangère ou peu fiables ; si aucune ne convient, n'en garde aucune.
Réponds UNIQUEMENT en JSON : {"picks":[{"concept":"…","videos":[{"id":"…","why":"en une phrase : ce que la vidéo montre et le lien avec le cours"}]}]}`,
    messages: [{ role: "user", content: JSON.stringify(lists.map((l) => ({ concept: l.concept, candidates: l.candidates }))) }],
  });
  const picks = parseJson(r2.text)?.picks || [];
  const byId = new Map(lists.flatMap((l) => l.candidates).map((v) => [v.id, v]));
  return {
    concepts: picks
      .map((p) => ({ concept: p.concept, videos: (p.videos || []).map((v) => byId.get(v.id) && { ...byId.get(v.id), why: v.why }).filter(Boolean) }))
      .filter((p) => p.videos.length),
  };
}

export async function generateDeliverable(type, id, kind) {
  if (!PROMPTS[kind] && kind !== "videos") throw new Error("Type de livrable inconnu");
  const scope = await scopeInfo(type, id);
  if (!scope) throw new Error("Périmètre introuvable");
  const passages = await gather(type, id);
  if (!passages.length) throw new Error("Aucun document importé dans ce périmètre : importe d'abord des lectures.");
  if (kind === "videos") {
    const data = await generateVideos(scope, passages);
    return { ...data, scopeLabel: scope.label, passages: passages.length };
  }
  const plan = await structureText({ type, id });
  const corpus = passages
    .map((p, i) => `[P${i + 1}] (${citeLabel(p)} — ${p.title})\n${p.content}`)
    .join("\n\n");
  const { text, stop } = await callClaude({
    feature: `livrable : ${KINDS[kind]}`,
    model: MODELS.main,
    max_tokens: 12000,
    system: PROMPTS[kind],
    messages: [{ role: "user", content: `Périmètre : ${scope.label}\n\nPlan (pour situer) :\n${plan}\n\nPassages :\n\n${corpus}\n\nProduis le JSON demandé.` }],
  });
  const raw = parseJson(text);
  if (!raw) throw new Error(stop === "max_tokens" ? "Réponse coupée avant la fin : réessaie." : "Réponse illisible : réessaie.");

  let data;
  if (kind === "mindmap") {
    data = {
      center: raw.center || scope.label,
      branches: (raw.branches || []).map((b) => resolveTree(b, passages)).filter(Boolean),
      links: (raw.links || []).map((l) => ({ from: l.from, to: l.to, type: l.type, note: l.note || "", refs: refsOf(l.sources, passages) })),
    };
  } else if (kind === "authors") {
    data = {
      synthesis: raw.synthesis || "",
      rows: (raw.rows || []).map((r) => ({ ...r, sources: undefined, refs: refsOf(r.sources, passages) })),
    };
  } else if (kind === "quiz") {
    data = {
      questions: (raw.questions || [])
        .filter((x) => x?.q)
        .map((x) => ({
          type: x.type === "open" ? "open" : "mcq",
          q: x.q,
          choices: x.type === "open" ? undefined : (x.choices || []).slice(0, 5),
          answer: x.answer,
          explain: x.explain || "",
          refs: refsOf(x.sources, passages),
        })),
      progress: {},
    };
  } else {
    // vérification mot pour mot : une citation introuvable dans son passage est écartée
    let rejected = 0;
    const concepts = (raw.concepts || [])
      .map((c) => ({
        concept: c.concept,
        quotes: (c.quotes || [])
          .map((qt) => {
            const p = passages[Number(qt.source) - 1];
            const clean = String(qt.text || "").replace(/^["'“”\s]+|["'“”\s]+$/g, "");
            if (!p || clean.split(/\s+/).length < 5 || !norm(p.content).includes(norm(clean))) {
              rejected++;
              return null;
            }
            return { text: clean, use: qt.use || "", refs: refsOf([qt.source], passages) };
          })
          .filter(Boolean),
      }))
      .filter((c) => c.quotes.length);
    data = { concepts, rejected };
  }
  data.scopeLabel = scope.label;
  data.passages = passages.length;
  return data;
}
