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
  return diversify(found, MAX_PASSAGES, type === "module" ? 8 : 5).filter((p) => p.kind !== "notes");
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

export async function generateDeliverable(type, id, kind) {
  if (!PROMPTS[kind]) throw new Error("Type de livrable inconnu");
  const scope = await scopeInfo(type, id);
  if (!scope) throw new Error("Périmètre introuvable");
  const passages = await gather(type, id);
  if (!passages.length) throw new Error("Aucun document importé dans ce périmètre : importe d'abord des lectures.");
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
