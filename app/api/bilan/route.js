import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";

// Une référence « à corriger » : nom de fichier, nom Windows court (CHANDL~1),
// référence complète au lieu de « Auteur, année », ou erreur de détection.
const BAD_REF_SQL = `(
  d.kind in ('reading','web','other') and (
    d.intext = d.title or d.intext like '%~%' or d.intext like '%(%' or d.intext !~ '(\\d{4}|n\\.d\\.)'
    or d.metadata ? 'error'
  )
)`;

// GET : état de chaque chapitre (documents, vidéos, fiches, références)
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const rows = await q(
    `select c.id as course_id, c.code, c.title as course_title, c.semester, c.canvas_id,
            m.id as module_id, m.title as module_title,
            ch.id as chapter_id, ch.title as chapter_title,
            count(d.*) filter (where d.kind = 'reading')::int as readings,
            count(d.*) filter (where d.kind in ('slides','screens'))::int as slides,
            count(d.*) filter (where d.kind = 'video')::int as videos,
            count(d.*) filter (where d.kind = 'video' and d.status = 'ready')::int as videos_ready,
            count(d.*) filter (where d.kind = 'page')::int as canvas_pages,
            count(d.*) filter (where d.kind = 'web')::int as web,
            count(d.*) filter (where d.kind = 'notes')::int as notes,
            count(d.*) filter (where d.status <> 'ready' and d.kind <> 'video')::int as incomplete,
            count(d.*) filter (where ${BAD_REF_SQL})::int as bad_refs,
            (select max(created_at) from sheets s where s.chapter_id = ch.id and s.kind = 'fr') as sheet_fr,
            (select max(created_at) from sheets s where s.chapter_id = ch.id and s.kind = 'en') as sheet_en
       from courses c
       join modules m on m.course_id = c.id
       join chapters ch on ch.module_id = m.id
       left join documents d on d.chapter_id = ch.id
      group by c.id, m.id, ch.id
      order by c.semester nulls last, c.code nulls last, c.id, m.position, m.id, ch.position, ch.id`
  );
  const badRefs = await q(
    `select d.id, d.title, d.intext, d.chapter_id from documents d where ${BAD_REF_SQL} order by d.id`
  );
  return Response.json({ rows, badRefs });
}
