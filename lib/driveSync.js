import { q } from "@/lib/db";
import { driveFolder, driveUpload } from "@/lib/google";
import { segmentsToHtml, textDocHtml } from "@/lib/blocksHtml";

const DEFAULT_ROOT = "UiT The Arctic University of Norway - Master";
const safe = (s, max = 90) =>
  String(s || "sans titre").replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) || "sans titre";
const MIME = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

async function getDriveSettings() {
  return (await q(`select value from settings where key = 'drive'`))[0]?.value || {};
}
export async function setDriveSettings(patch) {
  const next = { ...(await getDriveSettings()), ...patch };
  await q(`insert into settings (key, value) values ('drive', $1) on conflict (key) do update set value = $1`, [JSON.stringify(next)]);
  return next;
}

async function itemMap() {
  const rows = await q(`select key, drive_id, version from drive_items`);
  return new Map(rows.map((r) => [r.key, r]));
}
async function saveItem(key, driveId, version = null) {
  await q(
    `insert into drive_items (key, drive_id, version, synced_at) values ($1, $2, $3, now())
     on conflict (key) do update set drive_id = $2, version = $3, synced_at = now()`,
    [key, driveId, version]
  );
}

// Fait avancer la synchro jusqu'à `deadline` (ms) ; renvoie ce qui reste.
export async function syncDrive({ deadline = Date.now() + 240000 } = {}) {
  const settings = await getDriveSettings();
  const items = await itemMap();
  let done = 0;

  const folder = async (key, name, parentKey) => {
    const hit = items.get(key);
    if (hit) return hit.drive_id;
    const parentId = parentKey ? await folderOf(parentKey) : null;
    const id = await driveFolder(name, parentId);
    await saveItem(key, id);
    items.set(key, { key, drive_id: id });
    return id;
  };
  const folders = new Map(); // key -> [name, parentKey]
  const folderOf = (key) => {
    const f = folders.get(key);
    return folder(key, f[0], f[1]);
  };
  folders.set("root", [settings.rootName || DEFAULT_ROOT, null]);

  const courses = await q(`select id, code, title, semester from courses order by semester nulls last, code`);
  const modules = await q(`select id, course_id, title from modules order by position, id`);
  const chapters = await q(`select id, module_id, title from chapters order by position, id`);
  for (const c of courses) {
    const sKey = `sem:${c.semester || 0}`;
    folders.set(sKey, [c.semester ? `Semestre ${c.semester}` : "Semestre non défini", "root"]);
    folders.set(`course:${c.id}`, [safe(`${c.code ? c.code + " - " : ""}${c.title}`), sKey]);
  }
  for (const m of modules) folders.set(`module:${m.id}`, [safe(m.title), `course:${m.course_id}`]);
  for (const ch of chapters) folders.set(`chapter:${ch.id}`, [safe(ch.title), `module:${ch.module_id}`]);

  // Ce qu'il faut envoyer
  const todo = [];
  const docs = await q(
    `select d.id, d.chapter_id, d.title, d.kind, d.blob_url, d.intext, d.reference,
            case when d.kind in ('video','web','page') then
              (select string_agg(p.text, E'\n\n' order by p.pdf_page) from pages p where p.document_id = d.id) end as text,
            d.status
       from documents d where d.status = 'ready' or d.kind = 'video' order by d.chapter_id, d.id`
  );
  for (const d of docs) {
    const version = d.kind === "video" ? `${d.status}:${(d.text || "").length}` : "1";
    const it = items.get(`doc:${d.id}`);
    if (!it || it.version !== version) todo.push({ type: "doc", key: `doc:${d.id}`, version, d });
  }
  const sheets = await q(`select distinct on (chapter_id, kind) id, chapter_id, kind, citations from sheets order by chapter_id, kind, id desc`);
  for (const s of sheets) {
    const it = items.get(`sheet:${s.chapter_id}:${s.kind}`);
    if (!it || it.version !== String(s.id)) todo.push({ type: "sheet", key: `sheet:${s.chapter_id}:${s.kind}`, version: String(s.id), s });
  }
  const works = await q(`select chapter_id, max(updated_at) as v, json_agg(w order by w.id) as list from works w group by chapter_id`);
  for (const w of works) {
    const it = items.get(`works:${w.chapter_id}`);
    const v = new Date(w.v).toISOString();
    if (!it || it.version !== v) todo.push({ type: "works", key: `works:${w.chapter_id}`, version: v, w });
  }

  for (const t of todo) {
    if (Date.now() > deadline) break;
    const existing = items.get(t.key)?.drive_id || null;
    try {
      if (t.type === "doc") {
        const d = t.d;
        const parent = await folderOf(`chapter:${d.chapter_id}`);
        const base = safe(d.kind === "notes" ? `Fiche perso - ${d.title}` : `${d.intext} - ${d.title}`);
        let id;
        if (["video", "web", "page"].includes(d.kind)) {
          const label = d.kind === "video" ? "Vidéo" : d.kind === "page" ? "Page Canvas" : "Web";
          const html = textDocHtml(`${label} - ${d.title}`, [d.blob_url || "", `Référence : ${d.reference || ""}`, d.text || "(pas encore de transcription)"]);
          id = await driveUpload({ name: `${label} - ${base}`, parentId: parent, mimeType: "text/html", data: html, fileId: existing, asGoogleDoc: true });
        } else if (d.blob_url) {
          const ext = (d.blob_url.split("?")[0].match(/\.([a-z0-9]{2,5})$/i)?.[1] || "pdf").toLowerCase();
          const res = await fetch(d.blob_url);
          if (!res.ok) throw new Error(`fichier introuvable (${res.status})`);
          const buf = Buffer.from(await res.arrayBuffer());
          id = await driveUpload({ name: `${base}.${ext}`, parentId: parent, mimeType: MIME[ext] || "application/octet-stream", data: buf, fileId: existing });
        } else continue;
        await saveItem(t.key, id, t.version);
      } else if (t.type === "sheet") {
        const parent = await folderOf(`chapter:${t.s.chapter_id}`);
        const ch = chapters.find((c) => c.id === t.s.chapter_id);
        const name = t.s.kind === "fr" ? "Fiche explicative (FR)" : "Revision sheet (EN)";
        const html = segmentsToHtml(`${name} — ${ch?.title || ""}`, "", t.s.citations?.segments);
        const id = await driveUpload({ name, parentId: parent, mimeType: "text/html", data: html, fileId: existing, asGoogleDoc: true });
        await saveItem(t.key, id, t.version);
      } else if (t.type === "works") {
        const parent = await folderOf(`chapter:${t.w.chapter_id}`);
        const lines = [];
        for (const w of t.w.list) {
          lines.push(`[${w.kind}] ${w.question}`);
          lines.push(w.answer ? `Ma réponse :\n${w.answer}` : "Ma réponse : (vide)");
        }
        const html = textDocHtml("Mes travaux", lines);
        const id = await driveUpload({ name: "Mes travaux", parentId: parent, mimeType: "text/html", data: html, fileId: existing, asGoogleDoc: true });
        await saveItem(t.key, id, t.version);
      }
      done++;
    } catch (err) {
      // fichier supprimé dans Drive : on le recréera au prochain passage
      if (/Google 404/.test(String(err.message))) await q(`delete from drive_items where key = $1`, [t.key]);
      await setDriveSettings({ lastError: `${t.key} : ${String(err.message).slice(0, 200)}` });
    }
  }
  const remaining = Math.max(0, todo.length - done);
  const rootId = items.get("root")?.drive_id || null;
  await setDriveSettings({ lastSync: new Date().toISOString(), remaining, rootId, ...(remaining === 0 ? { lastError: null } : {}) });
  return { done, remaining, rootId };
}
