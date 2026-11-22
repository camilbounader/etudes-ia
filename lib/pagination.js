// Détection des numéros de page imprimés dans un PDF.
//
// Principe : sur chaque page, on lit uniquement les nombres situés dans les
// marges (haut et bas de page, là où sont les numéros). Pour chaque nombre n
// trouvé sur la page PDF i, on calcule un décalage n - i. Le décalage le plus
// fréquent sur l'ensemble du document est le bon (ex. Bergström : +30).
//
// Entrée : pages = [{ height, items: [{ str, y }] }]  (y mesuré depuis le haut)
// Sortie : { offset, confidence, printed: [ "31", "32", ... | null ] }

const MARGIN = 0.1; // 10 % de la hauteur en haut et en bas

function marginNumbers(page) {
  const h = page.height || 1;
  const found = new Set();
  for (const it of page.items || []) {
    if (it.y > h * MARGIN && it.y < h * (1 - MARGIN)) continue;
    const matches = String(it.str).match(/\d{1,4}/g) || [];
    for (const m of matches) {
      const n = Number(m);
      if (n < 1) continue;
      if (n >= 1900 && n <= 2099) continue; // une année, pas une page
      found.add(n);
    }
  }
  return [...found];
}

export function detectPagination(pages) {
  const n = pages.length;
  const votes = new Map(); // offset -> Set(index de page)
  pages.forEach((p, idx) => {
    const i = idx + 1;
    for (const num of marginNumbers(p)) {
      const off = num - i;
      if (!votes.has(off)) votes.set(off, new Set());
      votes.get(off).add(i);
    }
  });

  let best = null;
  let bestSet = new Set();
  for (const [off, set] of votes) {
    if (set.size > bestSet.size || (set.size === bestSet.size && best !== null && Math.abs(off) < Math.abs(best))) {
      best = off;
      bestSet = set;
    }
  }

  const needed = Math.max(2, Math.ceil(n * 0.25));
  if (best === null || bestSet.size < needed) {
    return { offset: null, confidence: 0, printed: pages.map(() => null) };
  }

  const supported = [...bestSet].sort((a, b) => a - b);
  const last = supported[supported.length - 1];
  // Pages sans numéro visible (première page d'article, début de chapitre) :
  // on applique le même décalage, sauf aux pages de garde d'éditeur
  // (Taylor & Francis, JSTOR...) qui ne font pas partie du texte.
  const coverWords = /(To cite this article|Full Terms & Conditions|JSTOR is a not-for-profit|Terms and Conditions of use)/i;

  const printed = pages.map((p, idx) => {
    const i = idx + 1;
    if (i > last + 1) return null;
    if (coverWords.test(pageText(p))) return null;
    const num = i + best;
    return num >= 1 ? String(num) : null; // pages liminaires (i, ii...) : pas de numéro arabe
  });

  return {
    offset: best,
    confidence: Math.round((bestSet.size / n) * 100) / 100,
    printed,
  };
}

function pageText(p) {
  return (p?.items || []).map((it) => it.str).join(" ");
}
