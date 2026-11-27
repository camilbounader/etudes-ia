// Lecture d'un PowerPoint (.pptx) : texte, notes et commentaire audio de chaque diapo
const xmlText = (xml) =>
  (String(xml || "").match(/<a:p[ >][\s\S]*?<\/a:p>/g) || [])
    .map((p) => (p.match(/<a:t>([^<]*)<\/a:t>/g) || []).map((t) => t.replace(/<\/?a:t>/g, "")).join(""))
    .filter((t) => t.trim())
    .join("\n")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"');

function relsMap(xml, baseDir) {
  const out = {};
  for (const m of String(xml || "").matchAll(/<Relationship\b[^>]*>/g)) {
    const id = (m[0].match(/Id="([^"]+)"/) || [])[1];
    const target = (m[0].match(/Target="([^"]+)"/) || [])[1];
    const type = (m[0].match(/Type="([^"]+)"/) || [])[1] || "";
    if (!id || !target || /TargetMode="External"/.test(m[0])) continue;
    // résout « ../media/media1.m4a » depuis ppt/slides/
    const parts = (target.startsWith("/") ? target.slice(1) : `${baseDir}/${target}`).split("/");
    const stack = [];
    for (const p of parts) p === ".." ? stack.pop() : p !== "." && stack.push(p);
    out[id] = { path: stack.join("/"), type };
  }
  return out;
}

export const AUDIO_EXT = /\.(m4a|mp3|wav|aac|wma|mp4|m4v|mov)$/i;


export async function parsePptx(zip) {
  const pres = await zip.file("ppt/presentation.xml")?.async("string");
  const presRels = relsMap(await zip.file("ppt/_rels/presentation.xml.rels")?.async("string"), "ppt");
  const order = [...String(pres || "").matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/g)].map((m) => presRels[m[1]]?.path).filter(Boolean);
  if (!order.length) throw new Error("aucune diapositive trouvée (fichier .ppt ancien ? enregistre-le en .pptx)");
  const slides = [];
  for (const path of order) {
    const xml = await zip.file(path)?.async("string");
    const dir = path.split("/").slice(0, -1).join("/");
    const rels = relsMap(await zip.file(`${dir}/_rels/${path.split("/").pop()}.rels`)?.async("string"), dir);
    const notesPath = Object.values(rels).find((r) => /notesSlide/.test(r.type))?.path;
    const notes = notesPath ? xmlText(await zip.file(notesPath)?.async("string")).replace(/^\d+$/gm, "").trim() : "";
    const audio = Object.values(rels).find((r) => AUDIO_EXT.test(r.path) && zip.file(r.path));
    slides.push({ text: xmlText(xml), notes, audio: audio?.path || null });
  }
  return slides;
}
