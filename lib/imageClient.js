"use client";

// Images d'un import « captures » : fichiers image, ou images contenues dans
// un Word (.docx), dans l'ordre où elles apparaissent dans le document.

export async function imagesFromFile(file) {
  const name = file.name.toLowerCase();
  if (/\.(png|jpe?g|webp)$/.test(name)) return [file];
  if (name.endsWith(".docx")) return imagesFromDocx(file);
  throw new Error("Format non pris en charge (PNG, JPG ou Word .docx)");
}

export async function imagesFromDocx(file) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const docXml = await zip.file("word/document.xml")?.async("string");
  const relsXml = await zip.file("word/_rels/document.xml.rels")?.async("string");
  const rels = {};
  for (const m of (relsXml || "").matchAll(/<Relationship\b[^>]*>/g)) {
    const id = (m[0].match(/Id="([^"]+)"/) || [])[1];
    const target = (m[0].match(/Target="([^"]+)"/) || [])[1];
    if (id && target) rels[id] = target.startsWith("/") ? target.slice(1) : `word/${target}`;
  }
  const order = [];
  for (const m of (docXml || "").matchAll(/r:embed="([^"]+)"/g)) {
    const path = rels[m[1]];
    if (path && !order.includes(path)) order.push(path);
  }
  // secours : toutes les images du dossier media
  if (!order.length) {
    zip.folder("word/media").forEach((rel) => order.push(`word/media/${rel}`));
    order.sort((a, b) => Number(a.match(/(\d+)/)?.[1] || 0) - Number(b.match(/(\d+)/)?.[1] || 0));
  }
  const out = [];
  for (const path of order) {
    if (!/\.(png|jpe?g|gif|bmp|webp)$/i.test(path)) continue;
    const f = zip.file(path);
    if (f) out.push(await f.async("blob"));
  }
  return out;
}

// Réduit une image (max 1600 px) et la renvoie en JPEG base64, pour l'envoyer
// à l'API sans dépasser les limites de taille.
export async function toJpegBase64(blob, max = 1600) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return dataUrl.split(",")[1];
}
