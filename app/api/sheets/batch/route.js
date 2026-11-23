import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";
import { createBatch, getBatch, batchResults } from "@/lib/anthropic";
import { renderAnswer } from "@/lib/chat";
import { logClaudeUsage } from "@/lib/usage";
import { segmentsToMarked, countWords } from "@/lib/marked";
import { PARTS, chapterPassages, targetWordsFor, sheetRequest } from "@/lib/sheetGen";

export const maxDuration = 300;

// POST { chapterId, kinds: ["fr","en"] } : envoie les fiches d'un chapitre en mode lot
export async function POST(request) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { chapterId, kinds = ["fr", "en"] } = await request.json();
  try {
    const { ch, passages, volume } = await chapterPassages(chapterId);
    if (!passages.length) return Response.json({ ok: true, skipped: "aucun document" });
    const requests = [];
    const targets = {};
    for (const kind of kinds) {
      targets[kind] = targetWordsFor(kind, volume);
      for (let part = 0; part < PARTS[kind].length; part++) {
        requests.push({ custom_id: `${kind}-${part}`, params: await sheetRequest({ ch, passages, kind, part, targetWords: targets[kind] }) });
      }
    }
    const batch = await createBatch(requests);
    // on garde la description des passages (sans leur texte) pour relier les citations
    const meta = passages.map(({ content, ...rest }) => rest);
    await q(`insert into sheet_jobs (chapter_id, batch_id, kinds, passages, targets) values ($1, $2, $3, $4, $5)`, [
      ch.id,
      batch.id,
      kinds.join(","),
      JSON.stringify(meta),
      JSON.stringify(targets),
    ]);
    return Response.json({ ok: true, batchId: batch.id, requests: requests.length });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

// GET : vérifie les lots en cours et enregistre les fiches terminées
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const jobs = await q(`select * from sheet_jobs where status = 'pending' order by id`);
  let done = 0;
  for (const job of jobs) {
    try {
      const b = await getBatch(job.batch_id);
      if (b.processing_status !== "ended") continue;
      const results = await batchResults(b.results_url);
      for (const kind of job.kinds.split(",")) {
        const segments = [];
        let truncated = false;
        let failed = false;
        for (let part = 0; part < PARTS[kind].length; part++) {
          const r = results.get(`${kind}-${part}`);
          if (!r || r.type !== "succeeded") {
            failed = true;
            break;
          }
          if (r.message.stop_reason === "max_tokens") truncated = true;
          await logClaudeUsage(r.message.model, r.message.usage, `fiche ${kind} (lot)`, true);
          const rendered = renderAnswer(r.message.content || [], job.passages);
          segments.push(...rendered.segments, { text: "\n\n", cites: [] });
        }
        if (failed) continue;
        const { full } = segmentsToMarked(segments);
        const plain = segments.map((s) => s.text + (s.cites?.length ? ` (${s.cites.map((c) => c.label).join("; ")})` : "")).join("");
        await q(`insert into sheets (chapter_id, kind, content, citations, words) values ($1, $2, $3, $4, $5)`, [
          job.chapter_id,
          kind,
          plain,
          JSON.stringify({ segments, targetWords: job.targets?.[kind], truncated, batch: true }),
          countWords(full),
        ]);
      }
      await q(`update sheet_jobs set status = 'done', finished_at = now() where id = $1`, [job.id]);
      done++;
    } catch (err) {
      await q(`update sheet_jobs set error = $1 where id = $2`, [String(err.message || err).slice(0, 300), job.id]);
    }
  }
  const pending = await q(`select count(*)::int as n from sheet_jobs where status = 'pending'`);
  return Response.json({ done, pending: pending[0].n });
}
