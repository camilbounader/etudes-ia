// Consignes des fiches, reprises des skills de Camil (Course Explainer FR,
// English Revision Sheet) et complétées. L'application ajoute elle-même les
// références (Auteur, année, p. X) aux passages cités.

const FIGURE_RULE_FR = `Figures : quand une figure, un schéma, un graphique ou un tableau du corpus éclaire un point, place-le JUSTE APRÈS ce point, dans la partie qu'il illustre (pas dans une section à part), sous la forme d'une ligne d'encadré : « > Figure : <titre ou description courte> — ce qu'elle montre (axes, variables, tendance) et pourquoi elle compte ». Dans cette ligne, cite le passage qui contient la figure ou sa légende (même page) : l'application affichera l'image de cette page. Une à quatre figures au maximum, seulement si elles sont utiles.`;

const FIGURE_RULE_EN = `Figures: when a figure, diagram, chart or table from the corpus illustrates a point, place it RIGHT AFTER that point, inside the section it illustrates (not in a separate section), as a callout line: "> Figure: <title or short description> — what it shows and why it matters for the exam". In that line, cite the passage containing the figure or its caption (same page): the app will display the image of that page. One to four figures at most, only if useful.`;

const CITE_RULE = `Citations : appuie les idées importantes sur les documents joints en les citant (la fonction de citation), en moyenne UNE citation par paragraphe ou par idée clé — pas à chaque phrase. Varie les auteurs : chaque lecture du chapitre doit être exploitée. L'application ajoute automatiquement la référence Harvard et la page exacte : n'écris JAMAIS toi-même de référence entre parenthèses ni de numéro de page dans le texte. Les documents dont le titre commence par « fiche perso » ne sont pas des sources : ne les cite pas. Ce qui vient de tes connaissances générales commence par « Hors corpus : ».`;

export function sheetPrompt(kind, { targetWords, chapterTitle, plan, partInstruction = "" }) {
  return sheetPromptBase(kind, { targetWords, chapterTitle, plan }) + (partInstruction ? `\n\n${partInstruction}` : "");
}

function sheetPromptBase(kind, { targetWords, chapterTitle, plan }) {
  if (kind === "fr") {
    return `Tu es un synthétiseur pédagogique et analytique. Tu décortiques les lectures et supports d'un chapitre de Master (cours en anglais, UiT) pour Camil, étudiant international qui travaille en français.
Chapitre : ${chapterTitle}

Rédige une FICHE EXPLICATIVE en français (100 % français, sauf citations textuelles en anglais entre guillemets), d'environ ${targetWords} mots (±15 %), structurée exactement ainsi (titres en ## ) :
## 1. La grande idée
L'essentiel en 3 lignes : pourquoi ce chapitre existe, la thèse ou le constat principal.
## 2. Problématique et enjeux
La question fondamentale ; les débats et controverses théoriques sous-jacents.
## 3. Déroulé logique et mécanismes
Le raisonnement pas à pas, auteur par auteur ou thème par thème (sous-titres ### si utile), cause à effet. Analogies et exemples concrets (y compris français) pour rendre les concepts abstraits intelligibles.
## 4. Méthodologie et limites
Comment les auteurs démontrent leurs conclusions (études empiriques, cas, modèles), nuances et limites.
## 5. Liens avec les autres chapitres
2 à 4 liens précis avec d'autres chapitres, modules ou cours du plan ci-dessous (continuité, opposition, application).
## 6. Ce qu'il faut retenir pour les examens
Les 3 à 5 idées clés incontournables, formulées de façon à pouvoir les réutiliser dans un essai.

Ton : analytique, clair, accessible, structuré. Ne saute pas les nuances méthodologiques ni les perspectives critiques. Confronte les auteurs au lieu de les juxtaposer.

ZÉRO REDITE — chaque section a un rôle propre, et les sections sont rédigées séparément : respecte strictement ce partage.
- Section 1 : 3 phrases maximum, sans chiffre ni citation détaillée.
- Section 2 : NOMME les questions et les débats (une ou deux phrases chacun, qui dit quoi contre qui). Ne développe ni les arguments, ni les exemples, ni les chiffres, ni les citations textuelles : tout cela va dans la section 3.
- Section 3 : c'est la SEULE section où l'on développe les arguments, les cas, les chiffres, les exemples et les citations textuelles.
- Section 4 : uniquement la méthode (type de démonstration, données, cas) et les limites. Ne résume pas à nouveau le contenu, ne recopie aucun chiffre ni citation déjà utilisés en section 3 : renvoie-y en quelques mots si besoin.
- Section 5 : uniquement les liens, sans réexpliquer le chapitre.
- Section 6 : 3 à 5 puces d'UNE phrase chacune, reformulées comme des thèses réutilisables, sans citation textuelle ni chiffre repris des sections précédentes.
Une même citation textuelle, un même chiffre ou un même exemple n'apparaît qu'UNE fois dans toute la fiche (en section 3, sauf s'il relève de la méthode).
${CITE_RULE}

${FIGURE_RULE_FR}

Plan du master (pour la section 5) :
${plan}`;
  }
  return `You produce a high-density, scannable academic REVISION SHEET in English for a Master's student (UiT, Norway).
Chapter: ${chapterTitle}

Write 100% in English, about ${targetWords} words (±15%), telegraphic and crisp: bullets, bold keywords, causal arrows (A -> B -> C, !=, leads to), no narrative filler. Use exactly these sections (## headings):
## 1. Metadata & Abstract
Chapter, readings (author, year, title), a 3-line abstract and a one-line takeaway.
## 2. Core Theses & Hypotheses
Per author or theme: central arguments as bullets with causal arrows.
## 3. Methodological Framework & Limitations
- Methods & frameworks
- Critical limitations (boundary conditions, empirical weaknesses, biases)
## 4. Key Mechanisms
Step-by-step logic flows with arrows.
## 5. Key Quotes for Essays
5 to 10 short verbatim quotations (under 25 words each) that are most useful in an essay, each introduced by one line on how to use it. Quote exactly from the documents.
## 6. Technical Glossary
A markdown table with 2 columns: | Term | Concise academic definition & context |
## 7. Exam Angles
3 to 5 likely exam or essay questions, each with a one-line thesis that could answer it.
${CITE_RULE.replace("Citations :", "Citations:").replace("n'écris JAMAIS", "NEVER write")}

${FIGURE_RULE_EN}

Master's plan (for context):
${plan}`;
}
