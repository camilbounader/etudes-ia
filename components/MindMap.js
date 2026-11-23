"use client";

import { useMemo, useState } from "react";

// Carte mentale interactive : idée centrale au milieu, branches à gauche et à droite.
// Clic sur un nœud : déplie / replie ses enfants et affiche son explication.
const COL = 235; // écart horizontal entre niveaux
const W = 190; // largeur d'un nœud
const ROW = 58; // hauteur d'une ligne
const COLORS = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#65a30d", "#dc2626"];

function countLeaves(n, open) {
  if (!n.children?.length || !open.has(n.id)) return 1;
  return n.children.reduce((s, c) => s + countLeaves(c, open), 0);
}

export default function MindMap({ data }) {
  // identifiants stables : chemin dans l'arbre
  const tree = useMemo(() => {
    const tag = (n, id, color, depth) => ({
      ...n,
      id,
      color,
      depth,
      children: (n.children || []).map((c, i) => tag(c, `${id}.${i}`, color, depth + 1)),
    });
    return (data.branches || []).map((b, i) => tag(b, `${i}`, COLORS[i % COLORS.length], 1));
  }, [data]);

  const [open, setOpen] = useState(() => new Set(tree.map((b) => b.id)));
  const [sel, setSel] = useState(null);
  const [zoom, setZoom] = useState(1);

  const all = useMemo(() => {
    const m = new Map();
    const walk = (n) => {
      m.set(n.id, n);
      n.children.forEach(walk);
    };
    tree.forEach(walk);
    return m;
  }, [tree]);

  const layout = useMemo(() => {
    // répartit les branches à gauche / à droite pour équilibrer les hauteurs
    const sides = { right: [], left: [] };
    const h = { right: 0, left: 0 };
    for (const b of tree) {
      const side = h.right <= h.left ? "right" : "left";
      sides[side].push(b);
      h[side] += countLeaves(b, open);
    }
    const pos = new Map();
    const edges = [];
    const total = Math.max(h.right, h.left, 1) * ROW;
    for (const side of ["right", "left"]) {
      const dir = side === "right" ? 1 : -1;
      let cursor = (total - h[side] * ROW) / 2;
      const place = (n) => {
        const kids = open.has(n.id) ? n.children : [];
        let y;
        if (!kids.length) {
          y = cursor + ROW / 2;
          cursor += ROW;
        } else {
          const ys = kids.map(place);
          y = (ys[0] + ys[ys.length - 1]) / 2;
          kids.forEach((k) => edges.push([n.id, k.id]));
        }
        pos.set(n.id, { x: dir * n.depth * COL, y, side });
        return y;
      };
      sides[side].forEach((b) => {
        place(b);
        edges.push(["root", b.id]);
      });
    }
    pos.set("root", { x: 0, y: total / 2, side: "center" });
    const xs = [...pos.values()].map((p) => p.x);
    const minX = Math.min(...xs) - W / 2 - 20;
    const maxX = Math.max(...xs) + W / 2 + 20;
    return { pos, edges, width: maxX - minX, height: total + 20, dx: -minX, dy: 10 };
  }, [tree, open]);

  const P = (id) => {
    const p = layout.pos.get(id);
    return p ? { ...p, X: p.x + layout.dx, Y: p.y + layout.dy } : null;
  };

  function click(n) {
    setSel(n.id);
    if (!n.children.length) return;
    const next = new Set(open);
    next.has(n.id) ? next.delete(n.id) : next.add(n.id);
    setOpen(next);
  }
  function expandAll(on) {
    setOpen(on ? new Set(all.keys()) : new Set(tree.map((b) => b.id)));
  }

  const selected = sel ? all.get(sel) : null;
  const byLabel = (label) => [...all.values()].find((n) => n.label.trim().toLowerCase() === String(label || "").trim().toLowerCase());
  const links = (data.links || []).map((l) => ({ ...l, a: byLabel(l.from), b: byLabel(l.to) }));
  const selLinks = selected ? links.filter((l) => l.a?.id === selected.id || l.b?.id === selected.id) : [];

  const curve = (a, b, dashed, color) => {
    const sx = a.X + (b.X > a.X ? W / 2 : b.X < a.X ? -W / 2 : 0);
    const ex = b.X + (b.X > a.X ? -W / 2 : W / 2);
    const mx = (sx + ex) / 2;
    return <path d={`M${sx},${a.Y} C${mx},${a.Y} ${mx},${b.Y} ${ex},${b.Y}`} fill="none" stroke={color} strokeWidth={dashed ? 2 : 2.2}
      strokeDasharray={dashed ? "6 5" : undefined} opacity={dashed ? 0.9 : 0.55} />;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-sm no-print">
        <button onClick={() => expandAll(true)} className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300">Tout déplier</button>
        <button onClick={() => expandAll(false)} className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300">Replier</button>
        <button onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))} className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300">−</button>
        <button onClick={() => setZoom(1)} className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300">{Math.round(zoom * 100)} %</button>
        <button onClick={() => setZoom((z) => Math.min(1.6, z + 0.15))} className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300">+</button>
        <span className="text-slate-500 self-center">Clique un nœud pour l'expliquer et le déplier (● = contient des sous-idées).</span>
      </div>

      <div className="overflow-auto border rounded-xl bg-white" style={{ maxHeight: "75vh" }}>
        <div style={{ width: layout.width * zoom, height: layout.height * zoom }}>
          <div className="relative" style={{ width: layout.width, height: layout.height, transform: `scale(${zoom})`, transformOrigin: "0 0" }}>
            <svg className="absolute inset-0" width={layout.width} height={layout.height}>
              {layout.edges.map(([a, b]) => {
                const pa = P(a);
                const pb = P(b);
                return pa && pb ? <g key={`${a}-${b}`}>{curve(pa, pb, false, all.get(b)?.color || "#64748b")}</g> : null;
              })}
              {selLinks.map((l, i) => {
                const pa = l.a && P(l.a.id);
                const pb = l.b && P(l.b.id);
                return pa && pb ? <g key={`l${i}`}>{curve(pa, pb, true, "#e11d48")}</g> : null;
              })}
            </svg>
            {(() => {
              const r = P("root");
              return (
                <div className="absolute flex items-center justify-center text-center font-semibold rounded-2xl px-3 shadow bg-[#003349] text-white"
                  style={{ left: r.X - (W + 20) / 2, top: r.Y - 30, width: W + 20, height: 60, fontSize: 14 }}>
                  {data.center}
                </div>
              );
            })()}
            {[...all.values()].map((n) => {
              const p = P(n.id);
              if (!p) return null;
              const isSel = sel === n.id;
              const linked = selLinks.some((l) => l.a?.id === n.id || l.b?.id === n.id);
              return (
                <button key={n.id} onClick={() => click(n)} title={n.note}
                  className="absolute text-left rounded-lg px-2 leading-tight bg-white hover:shadow-md transition-shadow"
                  style={{
                    left: p.X - W / 2,
                    top: p.Y - 22,
                    width: W,
                    height: 44,
                    fontSize: n.depth === 1 ? 13 : 12,
                    fontWeight: n.depth === 1 ? 600 : 400,
                    border: `2px solid ${n.color}`,
                    borderLeftWidth: n.depth === 1 ? 6 : 2,
                    boxShadow: isSel ? `0 0 0 3px ${n.color}55` : linked ? "0 0 0 3px #e11d4855" : undefined,
                  }}>
                  <span className="line-clamp-2">{n.label}</span>
                  {n.children.length > 0 && (
                    <span className="absolute -right-2 -top-2 text-[10px] rounded-full px-1" style={{ background: n.color, color: "white" }}>
                      {open.has(n.id) ? "−" : `+${n.children.length}`}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {selected && (
        <div className="bg-white border rounded-xl p-4 text-sm space-y-2" style={{ borderLeft: `6px solid ${selected.color}` }}>
          <p className="font-semibold">{selected.label}</p>
          {selected.note && <p>{selected.note}</p>}
          <Refs refs={selected.refs} />
          {selLinks.length > 0 && (
            <div className="pt-1">
              <p className="text-xs uppercase text-slate-500">Liens avec d'autres idées (en pointillés)</p>
              <ul className="list-disc ml-5">
                {selLinks.map((l, i) => (
                  <li key={i}><strong>{l.from}</strong> {l.type} <strong>{l.to}</strong>{l.note ? ` : ${l.note}` : ""} <Refs refs={l.refs} inline /></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {links.length > 0 && (
        <details className="bg-white border rounded-xl p-4 text-sm" open>
          <summary className="font-semibold cursor-pointer">Liens transversaux ({links.length})</summary>
          <ul className="list-disc ml-5 mt-2 space-y-1">
            {links.map((l, i) => (
              <li key={i}>
                <button className="hover:underline" onClick={() => l.a && setSel(l.a.id)}><strong>{l.from}</strong></button> <em>{l.type}</em>{" "}
                <button className="hover:underline" onClick={() => l.b && setSel(l.b.id)}><strong>{l.to}</strong></button>
                {l.note ? ` : ${l.note}` : ""} <Refs refs={l.refs} inline />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function Refs({ refs, inline }) {
  if (!refs?.length) return null;
  const items = refs.map((r, i) => (
    <span key={i}>
      {i > 0 ? "; " : ""}
      {r.url ? <a href={r.url} target="_blank" className="text-blue-700 hover:underline">{r.label}</a> : r.label}
    </span>
  ));
  return inline ? <span className="text-slate-500">({items})</span> : <p className="text-slate-500">Sources : ({items})</p>;
}
