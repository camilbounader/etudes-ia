import { parseBlocks, parseInline } from "@/lib/blocks";
import { segmentsToMarked } from "@/lib/marked";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(text, cites) {
  return parseInline(text)
    .map((p) => {
      if (p.type === "cite") {
        const c = cites[p.index];
        if (!c) return "";
        const label = ` (${esc(c.label)})`;
        return c.url ? `<a href="${esc(c.url)}" style="color:#2563eb">${label}</a>` : label;
      }
      if (p.bold) return `<b>${esc(p.text)}</b>`;
      if (p.italic) return `<i>${esc(p.text)}</i>`;
      return esc(p.text);
    })
    .join("");
}

// Segments (fiche, aperçu, réponse) -> HTML (pour un Google Doc)
export function segmentsToHtml(title, subtitle, segments) {
  const { full, cites } = segmentsToMarked(segments || []);
  const body = parseBlocks(full)
    .map((b) => {
      if (b.type === "heading") return `<h${Math.min(3, Math.max(1, b.level - 1))}>${inline(b.text, cites)}</h${Math.min(3, Math.max(1, b.level - 1))}>`;
      if (b.type === "list") {
        const tag = b.ordered ? "ol" : "ul";
        return `<${tag}>${b.items.map((i) => `<li>${inline(i, cites)}</li>`).join("")}</${tag}>`;
      }
      if (b.type === "table")
        return `<table border="1" style="border-collapse:collapse">${b.rows
          .map((r, i) => `<tr>${r.map((c) => (i === 0 ? `<th>${inline(c, cites)}</th>` : `<td>${inline(c, cites)}</td>`)).join("")}</tr>`)
          .join("")}</table>`;
      if (b.type === "quote") return `<p style="background:#fef3c7;border-left:4px solid #f59e0b;padding:4px 8px">${inline(b.text, cites)}</p>`;
      return `<p>${inline(b.text, cites)}</p>`;
    })
    .join("\n");
  return `<html><head><meta charset="utf-8"></head><body><h1>${esc(title)}</h1>${subtitle ? `<p><i>${esc(subtitle)}</i></p>` : ""}${body}</body></html>`;
}

export function textDocHtml(title, lines) {
  return `<html><head><meta charset="utf-8"></head><body><h1>${esc(title)}</h1>${lines
    .map((l) => (l.startsWith("http") ? `<p><a href="${esc(l)}">${esc(l)}</a></p>` : `<p>${esc(l).replace(/\n/g, "<br>")}</p>`))
    .join("")}</body></html>`;
}
