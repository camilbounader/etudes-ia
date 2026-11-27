import { guard } from "@/lib/auth";
import { ensureSchema } from "@/lib/schema";
import { q } from "@/lib/db";
import { canvasGet, listModules, getPage, getFile, fileIdsInHtml, videosInHtml, webLinksInHtml, canvasPageLink, norm } from "@/lib/canvas";

export const maxDuration = 120;

// Exécute fn sur chaque élément, n à la fois
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]).catch((e) => ({ error: String(e.message || e) }));
      }
    })
  );
  return out;
}

// fichiers importables : PDF, PowerPoint, Word, images, audio et vidéo
const IMPORTABLE = /\.(pdf|pptx|ppsx|pptm|ppsm|potx|ppt|pps|docx|png|jpe?g|webp|mp3|m4a|wav|aac|mp4|mov|webm)$/i;
const isImportable = (f) => /pdf/i.test(f?.["content-type"] || "") || IMPORTABLE.test(f?.display_name || f?.filename || "");

// GET : plan d'import d'un cours Canvas
// modules > chapitres (pages Canvas) > PDF liés, avec ce qui est déjà importé.
export async function GET(request, { params }) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSchema();
  const { id } = await params;
  const courseId = Number(id);

  try {
    const course = await canvasGet(`/courses/${courseId}`);
    const modules = await listModules(courseId);

    // 1. Structure : une page Canvas = un chapitre ; les fichiers et liens
    //    qui suivent une page dans le module lui sont rattachés.
    const plan = modules
      .sort((a, b) => a.position - b.position)
      .map((m) => {
        const mod = { canvasId: String(m.id), title: m.name, chapters: [], looseFiles: [] };
        let current = null;
        for (const it of (m.items || []).sort((a, b) => a.position - b.position)) {
          if (it.type === "Page") {
            current = { title: it.title, pageUrl: it.page_url, fileIds: [], links: [], videos: [] };
            mod.chapters.push(current);
          } else if (it.type === "File") {
            (current ? current.fileIds : mod.looseFiles).push(it.content_id);
          } else if (it.type === "ExternalUrl" || it.type === "ExternalTool") {
            if (current) current.links.push({ title: it.title, url: it.external_url || it.html_url });
          }
        }
        return mod;
      });

    // 2. Fichiers liés dans le texte de chaque page
    const chapters = plan.flatMap((m) => m.chapters);
    await pool(chapters, 5, async (ch) => {
      const page = await getPage(courseId, ch.pageUrl);
      for (const fid of fileIdsInHtml(page.body)) if (!ch.fileIds.includes(fid)) ch.fileIds.push(fid);
      ch.textLength = String(page.body || "").length;
      ch.webLinks = webLinksInHtml(page.body);
      ch.videos = videosInHtml(page.body).map((v) => ({ ...v, url: v.url || canvasPageLink(courseId, ch.pageUrl) }));
    });

    // 3. Détails des fichiers (on ne garde que les PDF)
    const allIds = [...new Set(plan.flatMap((m) => [...m.looseFiles, ...m.chapters.flatMap((c) => c.fileIds)]))];
    const metas = await pool(allIds, 6, (fid) => getFile(fid));
    const meta = new Map(allIds.map((fid, i) => [fid, metas[i]]));

    // 4. Ce qui existe déjà dans l'application
    const ours = (await q(`select id, code, title, canvas_id from courses`)).find(
      (c) => c.canvas_id === String(courseId) || (c.code && norm(c.code) === norm(course.course_code))
    );
    const ourModules = ours ? await q(`select id, title, canvas_id from modules where course_id = $1`, [ours.id]) : [];
    const ourChapters = ourModules.length
      ? await q(`select id, module_id, title, canvas_id from chapters where module_id = any($1::int[])`, [ourModules.map((m) => m.id)])
      : [];
    const importedFiles = new Set(
      (await q(`select canvas_file_id from documents where canvas_file_id is not null`)).map((r) => Number(r.canvas_file_id))
    );
    const importedPages = new Set(
      (await q(`select canvas_page_url from documents where canvas_page_url is not null`)).map((r) => r.canvas_page_url)
    );

    const importedVideos = new Set(
      (await q(`select canvas_page_url from documents where kind = 'video' and canvas_page_url is not null`)).map((r) => r.canvas_page_url)
    );

    const importedWeb = new Set(
      (await q(`select canvas_page_url from documents where canvas_page_url like 'web:%'`)).map((r) => r.canvas_page_url.slice(4))
    );

    const fileInfo = (fid) => {
      const f = meta.get(fid);
      if (!f || f.error || !isImportable(f)) return null;
      const name = f.display_name || f.filename;
      return { id: fid, name, size: f.size, ext: String(name).toLowerCase().split(".").pop(), imported: importedFiles.has(fid) };
    };

    const result = plan.map((m) => {
      const om = ourModules.find((x) => x.canvas_id === m.canvasId) || ourModules.find((x) => norm(x.title) === norm(m.title));
      return {
        canvasId: m.canvasId,
        title: m.title,
        existingId: om?.id || null,
        chapters: m.chapters.map((c) => {
          const oc = ourChapters.find(
            (x) => (om ? x.module_id === om.id : true) && (x.canvas_id === c.pageUrl || norm(x.title) === norm(c.title))
          );
          return {
            title: c.title,
            pageUrl: c.pageUrl,
            existingId: oc?.id || null,
            pageImported: importedPages.has(`${courseId}/${c.pageUrl}`),
            files: c.fileIds.map(fileInfo).filter(Boolean),
            links: c.links.filter((l) => !c.videos.some((v) => l.url && l.url.includes(v.key.split(":")[1]))),
            videos: c.videos.map((v) => ({ ...v, imported: importedVideos.has(`video:${v.key}`) })),
            // liens dans le texte de la page + liens « URL externe » du module
            webLinks: [...(c.webLinks || []), ...c.links.filter((l) => l.url && !/instructure|panopto|youtube|youtu\.be|ted\.com/i.test(l.url) && !(c.webLinks || []).some((w) => w.url === l.url))].map((l) => ({
              ...l,
              imported: importedWeb.has(l.url),
            })),
          };
        }),
        looseFiles: m.looseFiles.map(fileInfo).filter(Boolean),
      };
    });

    return Response.json({
      course: { canvasId: courseId, name: course.name, code: course.course_code, existingId: ours?.id || null },
      modules: result,
    });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
