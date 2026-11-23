// Fiche ou réponse -> fichier Word (.docx), avec titres, listes, tableaux,
// encadrés et références Harvard cliquables (lien vers la page du PDF).
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  ExternalHyperlink,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
} from "docx";
import { segmentsToMarked } from "./marked.js";
import { parseBlocks, parseInline } from "./blocks.js";

function runs(text, cites) {
  return parseInline(text).map((p) => {
    if (p.type === "cite") {
      const c = cites[p.index];
      if (!c) return new TextRun("");
      const label = ` (${c.label})`;
      return c.url
        ? new ExternalHyperlink({ link: c.url, children: [new TextRun({ text: label, style: "Hyperlink", color: "1D4ED8" })] })
        : new TextRun({ text: label, color: "1D4ED8" });
    }
    return new TextRun({ text: p.text, bold: p.bold, italics: p.italic });
  });
}

const HEADINGS = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3, 4: HeadingLevel.HEADING_4 };

export function buildDocx({ title, subtitle, segments }) {
  const { full, cites } = segmentsToMarked(segments);
  const children = [new Paragraph({ text: title, heading: HeadingLevel.TITLE })];
  if (subtitle) children.push(new Paragraph({ children: [new TextRun({ text: subtitle, italics: true, color: "64748B" })] }));

  for (const b of parseBlocks(full)) {
    if (b.type === "heading") {
      children.push(new Paragraph({ heading: HEADINGS[b.level] || HeadingLevel.HEADING_2, children: runs(b.text, cites) }));
    } else if (b.type === "list") {
      b.items.forEach((it) =>
        children.push(
          new Paragraph({
            children: runs(it, cites),
            ...(b.ordered ? { numbering: { reference: "num", level: 0 } } : { bullet: { level: 0 } }),
          })
        )
      );
    } else if (b.type === "table") {
      const cols = Math.max(...b.rows.map((r) => r.length));
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: b.rows.map(
            (row, r) =>
              new TableRow({
                tableHeader: r === 0,
                children: Array.from({ length: cols }, (_, c) =>
                  new TableCell({
                    shading: r === 0 ? { type: ShadingType.CLEAR, fill: "E2E8F0", color: "auto" } : undefined,
                    children: [new Paragraph({ children: r === 0 ? [new TextRun({ text: row[c] || "", bold: true })] : runs(row[c] || "", cites) })],
                  })
                ),
              })
          ),
        })
      );
      children.push(new Paragraph(""));
    } else if (b.type === "quote") {
      children.push(
        new Paragraph({
          children: runs(b.text, cites),
          shading: { type: ShadingType.CLEAR, fill: "FEF3C7", color: "auto" },
          border: { left: { style: BorderStyle.SINGLE, size: 18, color: "F59E0B", space: 6 } },
          indent: { left: 200 },
        })
      );
    } else {
      children.push(new Paragraph({ children: runs(b.text, cites) }));
    }
  }

  return new Document({
    creator: "Études IA",
    title,
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    numbering: {
      config: [{ reference: "num", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: "left" }] }],
    },
    sections: [{ children }],
  });
}

export async function docxBlob(args) {
  return Packer.toBlob(buildDocx(args));
}
