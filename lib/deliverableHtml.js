// Livrables (carte mentale, comparatif, citations, quiz, vidéos) -> HTML,
// pour un Google Doc ou un fichier à transmettre.
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const refs = (list) =>
  list?.length
    ? ` <span style="color:#555">(${list.map((r) => (r.url ? `<a href="${esc(r.url)}">${esc(r.label)}</a>` : esc(r.label))).join("; ")})</span>`
    : "";

export const DELIVERABLE_NAMES = {
  mindmap: "Carte mentale",
  authors: "Comparatif des auteurs",
  quotes: "Banque de citations",
  quiz: "Quiz",
  videos: "Vidéos en français",
};

function tree(nodes) {
  if (!nodes?.length) return "";
  return `<ul>${nodes.map((n) => `<li><b>${esc(n.label)}</b>${n.note ? ` : ${esc(n.note)}` : ""}${refs(n.refs)}${tree(n.children)}</li>`).join("")}</ul>`;
}

export function deliverableBody(kind, d) {
  if (kind === "mindmap") {
    return `<h2>${esc(d.center)}</h2>${tree(d.branches)}${
      d.links?.length
        ? `<h2>Liens transversaux</h2><ul>${d.links.map((l) => `<li><b>${esc(l.from)}</b> <i>${esc(l.type)}</i> <b>${esc(l.to)}</b>${l.note ? ` : ${esc(l.note)}` : ""}${refs(l.refs)}</li>`).join("")}</ul>`
        : ""
    }`;
  }
  if (kind === "authors") {
    const head = ["Auteur", "Concept clé", "Thèse", "Méthode", "Converge avec", "Diverge de / nuance", "Dans un essai", "Sources"];
    return `${d.synthesis ? `<p><b>Lignes de fracture : </b>${esc(d.synthesis)}</p>` : ""}<table border="1" style="border-collapse:collapse"><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr>${(d.rows || [])
      .map((r) => `<tr><td><b>${esc(r.author)}</b></td><td>${esc(r.concept)}</td><td>${esc(r.thesis)}</td><td>${esc(r.method)}</td><td>${esc(r.agrees)}</td><td>${esc(r.disagrees)}</td><td>${esc(r.use)}</td><td>${refs(r.refs)}</td></tr>`)
      .join("")}</table>`;
  }
  if (kind === "quotes") {
    return (d.concepts || [])
      .map((c) => `<h2>${esc(c.concept)}</h2>${c.quotes.map((q) => `<p><i>“${esc(q.text)}”</i>${refs(q.refs)}<br><span style="color:#555">${esc(q.use)}</span></p>`).join("")}`)
      .join("");
  }
  if (kind === "quiz") {
    return (d.questions || [])
      .map(
        (q, i) =>
          `<p><b>${i + 1}. ${esc(q.q)}</b></p>${
            q.type === "mcq"
              ? `<ol type="A">${q.choices.map((c) => `<li>${esc(c)}</li>`).join("")}</ol><p>Réponse : <b>${String.fromCharCode(65 + Number(q.answer))}</b> — ${esc(q.explain)}${refs(q.refs)}</p>`
              : `<p>Éléments attendus : ${esc(q.answer)}${refs(q.refs)}</p>`
          }`
      )
      .join("");
  }
  if (kind === "videos") {
    return (d.concepts || [])
      .map((c) => `<h2>${esc(c.concept)}</h2><ul>${c.videos.map((v) => `<li><a href="https://www.youtube.com/watch?v=${esc(v.id)}">${esc(v.title)}</a> — ${esc(v.channel)}, ${v.minutes} min. ${esc(v.why)}</li>`).join("")}</ul>`)
      .join("");
  }
  return "";
}

export function deliverableHtml(kind, d) {
  const title = `${DELIVERABLE_NAMES[kind] || kind} — ${d.scopeLabel || ""}`;
  return `<html><head><meta charset="utf-8"></head><body><h1>${esc(title)}</h1>${deliverableBody(kind, d)}</body></html>`;
}
