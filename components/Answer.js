"use client";

// Affiche une réponse ou une fiche : titres, paragraphes, listes, tableaux,
// encadrés, et références Harvard cliquables à l'endroit exact des citations.
import { useEffect, useState } from "react";
import { segmentsToMarked } from "@/lib/marked";
import { parseBlocks, parseInline, isFigureText, figureSource } from "@/lib/blocks";

// Image de la page du PDF où se trouve la figure
function FigureImage({ src }) {
  const [img, setImg] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    import("@/lib/pdfClient")
      .then(({ renderPdfPage }) => renderPdfPage(src.url, src.page))
      .then((r) => alive && setImg(r.dataUrl))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, [src.url, src.page]);
  if (err) return null;
  if (!img) return <p className="text-xs text-slate-400">Chargement de la figure (page {src.page})…</p>;
  return (
    <a href={`${src.url}#page=${src.page}`} target="_blank" title="Ouvrir le PDF à cette page">
      <img src={img} alt={`Page ${src.page} : ${src.label}`} className="max-h-[480px] mx-auto border rounded shadow-sm" />
    </a>
  );
}

function Inline({ text, cites }) {
  return parseInline(text).map((p, i) => {
    if (p.type === "cite") {
      const c = cites[p.index];
      if (!c) return null;
      return (
        <a
          key={i}
          href={c.url || undefined}
          target="_blank"
          title={c.quote}
          className="text-blue-700 bg-blue-50 rounded px-1 mx-0.5 text-[0.85em] whitespace-nowrap hover:underline"
        >
          ({c.label})
        </a>
      );
    }
    if (p.bold) return <strong key={i}>{p.text}</strong>;
    if (p.italic) return <em key={i}>{p.text}</em>;
    return <span key={i}>{p.text}</span>;
  });
}

export default function Answer({ message }) {
  const segments = message?.citations?.segments;
  if (!segments) return <div className="whitespace-pre-wrap">{message?.content}</div>;
  const { full, cites } = segmentsToMarked(segments);

  return (
    <div className="space-y-2 leading-relaxed">
      {parseBlocks(full).map((b, i) => {
        if (b.type === "heading")
          return (
            <p key={i} className={`${b.level <= 2 ? "text-lg mt-4" : "text-base mt-3"} font-semibold`}>
              <Inline text={b.text} cites={cites} />
            </p>
          );
        if (b.type === "list") {
          const Tag = b.ordered ? "ol" : "ul";
          return (
            <Tag key={i} className={`${b.ordered ? "list-decimal" : "list-disc"} pl-6 space-y-1`}>
              {b.items.map((it, j) => (
                <li key={j}>
                  <Inline text={it} cites={cites} />
                </li>
              ))}
            </Tag>
          );
        }
        if (b.type === "table")
          return (
            <div key={i} className="overflow-x-auto">
              <table className="text-sm border-collapse w-full">
                <tbody>
                  {b.rows.map((row, r) => (
                    <tr key={r} className={r === 0 ? "bg-slate-100 font-semibold" : "border-t"}>
                      {row.map((cell, c) => (
                        <td key={c} className="border px-2 py-1 align-top">
                          <Inline text={cell} cites={cites} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        if (b.type === "quote") {
          const src = isFigureText(b.text) ? figureSource(b.text, cites) : null;
          return (
            <figure key={i} className="space-y-2">
              {src && <FigureImage src={src} />}
              <blockquote className="border-l-4 border-amber-300 bg-amber-50 pl-3 py-1">
                <Inline text={b.text} cites={cites} />
              </blockquote>
            </figure>
          );
        }
        return (
          <p key={i}>
            <Inline text={b.text} cites={cites} />
          </p>
        );
      })}
    </div>
  );
}
