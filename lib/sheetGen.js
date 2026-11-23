import { q } from "@/lib/db";
import { searchPassages } from "@/lib/search";
import { structureText } from "@/lib/structure";
import { MODELS } from "@/lib/anthropic";
import { diversify, toDocumentBlock } from "@/lib/chat";
import { sheetPrompt } from "@/lib/sheetPrompts";

const BUDGET_CHARS = 340000; // ~85 000 tokens de corpus au maximum

// Une fiche est rédigée en plusieurs parties (évite qu'elle soit coupée).
export const PARTS = {
  fr: [
    { sections: "1 et 2", share: 0.25 },
    { sections: "3", share: 0.45 },
    { sections: "4, 5 et 6", share: 0.3 },
  ],
  en: [
    { sections: "1, 2 and 3", share: 0.4 },
    { sections: "4 and 5", share: 0.3 },
    { sections: "6 and 7", share: 0.3 },
  ],
};

// Passages du chapitre (toujours dans le même ordre : le cache fonctionne)
export async function chapterPassages(chapterId) {
  const ch = (await q(`select id, title from chapters where id = $1`, [Number(chapterId)]))[0];
  if (!ch) throw new Error("Chapitre introuvable");
  let passages = await q(
    `select c.id, c.content, c.pdf_page, c.printed_page, d.id as document_id, d.title, d.intext, d.blob_url, d.kind,
            $2::text as chapter_title
       from chunks c join documents d on d.id = c.document_id
      where d.chapter_id = $1 and coalesce(c.kind, 'text') <> 'refs' and d.kind <> 'notes'
      order by d.id, c.pdf_page, c.id`,
    [ch.id, ch.title]
  );
  const total = passages.reduce((n, p) => n + p.content.length, 0);
  if (total > BUDGET_CHARS) {
    const found = await searchPassages(`${ch.title}. Main arguments, concepts, methods and findings.`, { type: "chapter", id: ch.id }, 400);
    passages = diversify(found, Math.floor(BUDGET_CHARS / 1100), 60).sort((a, b) => a.document_id - b.document_id || a.pdf_page - b.pdf_page);
  }
  return { ch, passages, volume: Math.min(total, BUDGET_CHARS) };
}

export function targetWordsFor(kind, volume) {
  return kind === "fr"
    ? Math.round(Math.min(3000, Math.max(1500, volume / 120)) / 100) * 100
    : Math.round(Math.min(1800, Math.max(1000, volume / 220)) / 100) * 100;
}

// Paramètres d'appel Claude pour une partie d'une fiche
export async function sheetRequest({ ch, passages, kind, part, targetWords }) {
  const plan = await structureText({ type: "chapter", id: ch.id });
  const p = PARTS[kind][part];
  const words = Math.round((targetWords * p.share) / 50) * 50;
  const partInstruction =
    kind === "fr"
      ? `IMPORTANT : rédige UNIQUEMENT les sections ${p.sections} (avec leurs titres ##), environ ${words} mots au total. N'écris pas les autres sections : elles sont rédigées séparément. Pas d'introduction ni de conclusion en dehors de ces sections.`
      : `IMPORTANT: write ONLY sections ${p.sections} (with their ## headings), about ${words} words in total. Do not write the other sections: they are written separately. No preamble or closing text.`;
  const docs = passages.map(toDocumentBlock);
  // mise en cache du corpus : les parties suivantes (et l'autre fiche) le relisent à 10 % du prix
  if (docs.length) docs[docs.length - 1] = { ...docs[docs.length - 1], cache_control: { type: "ephemeral" } };
  return {
    model: MODELS.main,
    max_tokens: 16000,
    system: sheetPrompt(kind, { targetWords, chapterTitle: ch.title, plan, partInstruction }),
    messages: [
      {
        role: "user",
        content: [...docs, { type: "text", text: kind === "fr" ? `Rédige les sections ${p.sections}.` : `Write sections ${p.sections}.` }],
      },
    ],
  };
}
