"use client";

// Affiche une réponse : mise en forme simple (titres, gras, italique, listes)
// et références Harvard cliquables à l'endroit exact où Claude cite le corpus.

function inline(text, cites, keyBase) {
  // découpe autour des marqueurs de citation ⟦n⟧, puis du gras / italique
  const parts = String(text).split(/(⟦\d+⟧)/g);
  return parts.map((part, i) => {
    const m = part.match(/^⟦(\d+)⟧$/);
    if (m) {
      const c = cites[Number(m[1])];
      if (!c) return null;
      return (
        <a
          key={`${keyBase}-c${i}`}
          href={c.url || undefined}
          target="_blank"
          title={c.quote}
          className="text-blue-700 bg-blue-50 rounded px-1 mx-0.5 text-[0.85em] whitespace-nowrap hover:underline"
        >
          ({c.label})
        </a>
      );
    }
    const pieces = part.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g);
    return pieces.map((p, j) => {
      if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={`${keyBase}-${i}-${j}`}>{p.slice(2, -2)}</strong>;
      if (/^\*[^*]+\*$/.test(p)) return <em key={`${keyBase}-${i}-${j}`}>{p.slice(1, -1)}</em>;
      return <span key={`${keyBase}-${i}-${j}`}>{p}</span>;
    });
  });
}

export default function Answer({ message }) {
  const segments = message?.citations?.segments;
  if (!segments) {
    return <div className="whitespace-pre-wrap">{message.content}</div>;
  }

  // Texte complet avec marqueurs ⟦n⟧ à la fin de chaque passage cité
  const cites = [];
  let full = "";
  for (const s of segments) {
    full += s.text;
    for (const c of s.cites || []) {
      cites.push(c);
      full += `⟦${cites.length - 1}⟧`;
    }
  }

  const lines = full.split("\n");
  const out = [];
  let list = null;
  const flush = () => {
    if (list) {
      const Tag = list.ordered ? "ol" : "ul";
      out.push(
        <Tag key={`l${out.length}`} className={`${list.ordered ? "list-decimal" : "list-disc"} pl-6 space-y-1`}>
          {list.items}
        </Tag>
      );
      list = null;
    }
  };

  lines.forEach((line, idx) => {
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const ul = line.match(/^\s*[-•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (h) {
      flush();
      const size = h[1].length <= 2 ? "text-lg" : "text-base";
      out.push(
        <p key={idx} className={`${size} font-semibold mt-3`}>
          {inline(h[2], cites, idx)}
        </p>
      );
    } else if (ul || ol) {
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push(<li key={idx}>{inline((ul || ol)[1], cites, idx)}</li>);
    } else if (!line.trim()) {
      flush();
    } else {
      flush();
      out.push(<p key={idx}>{inline(line, cites, idx)}</p>);
    }
  });
  flush();

  return <div className="space-y-2 leading-relaxed">{out}</div>;
}
