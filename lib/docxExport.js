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
  ImageRun,
  AlignmentType,
  LineRuleType,
} from "docx";
import { segmentsToMarked } from "./marked.js";
import { parseBlocks, parseInline, isFigureText, figureSource } from "./blocks.js";

function runs(text, cites) {
  return parseInline(text).map((p) => {
    if (p.type === "cite") {
      const c = cites[p.index];
      if (!c) return new TextRun("");
      const label = ` (${c.label})`;
      const run = { text: label, color: "2563EB", size: 19 };
      return c.url ? new ExternalHyperlink({ link: c.url, children: [new TextRun(run)] }) : new TextRun(run);
    }
    return new TextRun({ text: p.text, bold: p.bold, italics: p.italic });
  });
}

// « ## » = grande partie (Titre 1), « ### » = sous-partie (Titre 2)…
const HEADINGS = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_1, 3: HeadingLevel.HEADING_2, 4: HeadingLevel.HEADING_3 };

// images : Map « url#page » -> { data: Uint8Array (PNG), width, height }
export function buildDocx({ title, subtitle, segments, images = new Map() }) {
  const { full, cites } = segmentsToMarked(segments);
  const children = [new Paragraph({ text: title, heading: HeadingLevel.TITLE })];
  if (subtitle) children.push(new Paragraph({ spacing: { after: 360 }, children: [new TextRun({ text: subtitle, italics: true, color: "64748B" })] }));

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
      const src = isFigureText(b.text) ? figureSource(b.text, cites) : null;
      const img = src && images.get(`${src.url}#${src.page}`);
      if (img) {
        // au plus 520 px de large et 460 px de haut
        const w = Math.round(Math.min(520, (460 * img.width) / img.height));
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 80, line: 240, lineRule: LineRuleType.AUTO },
            children: [new ImageRun({ type: "png", data: img.data, transformation: { width: w, height: Math.round((w * img.height) / img.width) } })],
          })
        );
      }
      children.push(
        new Paragraph({
          children: runs(b.text, cites),
          shading: { type: ShadingType.CLEAR, fill: "FEF3C7", color: "auto" },
          spacing: { before: 60, after: 200 },
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
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 }, paragraph: { spacing: { after: 140, line: 288, lineRule: LineRuleType.AUTO } } },
        title: { run: { font: "Calibri", size: 40, bold: true, color: "0F172A" }, paragraph: { spacing: { after: 80 } } },
        heading1: { run: { font: "Calibri", size: 30, bold: true, color: "1E3A8A" }, paragraph: { spacing: { before: 420, after: 140 } } },
        heading2: { run: { font: "Calibri", size: 26, bold: true, color: "2563EB" }, paragraph: { spacing: { before: 300, after: 100 } } },
        heading3: { run: { font: "Calibri", size: 23, bold: true, color: "334155" }, paragraph: { spacing: { before: 220, after: 80 } } },
      },
    },
    numbering: {
      config: [{ reference: "num", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: "left" }] }],
    },
    sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children }],
  });
}

export async function docxBlob(args) {
  return Packer.toBlob(buildDocx(args));
}
