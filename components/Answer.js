"use client";

// Affiche une réponse ou une fiche : titres, paragraphes, listes, tableaux,
// encadrés, et références Harvard cliquables à l'endroit exact des citations.
import { segmentsToMarked } from "@/lib/marked";
import { parseBlocks, parseInline } from "@/lib/blocks";

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
        if (b.type === "quote")
          return (
            <blockquote key={i} className="border-l-4 border-amber-300 bg-amber-50 pl-3 py-1">
              <Inline text={b.text} cites={cites} />
            </blockquote>
          );
        return (
          <p key={i}>
            <Inline text={b.text} cites={cites} />
          </p>
        );
      })}
    </div>
  );
}
