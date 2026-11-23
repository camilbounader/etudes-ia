// Découpe un texte (style markdown simple) en blocs : titres, paragraphes,
// listes, tableaux, encadrés. Partagé par l'affichage et l'export Word.
export function parseBlocks(full) {
  const lines = String(full || "").split("\n");
  const blocks = [];
  let list = null;
  let table = null;
  const flush = () => {
    if (list) blocks.push(list);
    if (table) blocks.push(table);
    list = null;
    table = null;
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const ul = line.match(/^\s*[-•*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const quote = line.match(/^\s*>\s?(.*)$/);
    const isRow = /^\s*\|.*\|\s*$/.test(line);
    if (isRow) {
      if (list) {
        blocks.push(list);
        list = null;
      }
      const cells = line.trim().slice(1, -1).split("|").map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // ligne de séparation
      if (!table) table = { type: "table", rows: [] };
      table.rows.push(cells);
      continue;
    }
    if (table) {
      blocks.push(table);
      table = null;
    }
    if (h) {
      flush();
      blocks.push({ type: "heading", level: h[1].length, text: h[2] });
    } else if (ul || ol) {
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { type: "list", ordered, items: [] };
      }
      list.items.push((ul || ol)[1]);
    } else if (quote) {
      flush();
      blocks.push({ type: "quote", text: quote[1] });
    } else if (!line.trim()) {
      flush();
    } else {
      flush();
      blocks.push({ type: "para", text: line });
    }
  }
  flush();
  return blocks;
}

// Découpe un texte en morceaux : texte, gras, italique, citation ⟦n⟧
export function parseInline(text) {
  const out = [];
  for (const part of String(text).split(/(⟦\d+⟧)/g)) {
    const m = part.match(/^⟦(\d+)⟧$/);
    if (m) {
      out.push({ type: "cite", index: Number(m[1]) });
      continue;
    }
    for (const p of part.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g)) {
      if (!p) continue;
      if (/^\*\*[^*]+\*\*$/.test(p)) out.push({ type: "text", text: p.slice(2, -2), bold: true });
      else if (/^\*[^*]+\*$/.test(p)) out.push({ type: "text", text: p.slice(1, -1), italic: true });
      else out.push({ type: "text", text: p });
    }
  }
  return out;
}
