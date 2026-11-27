import { guard } from "@/lib/auth";
import { sendChunk, readRange, fileInfo } from "@/lib/fileStore";

export const maxDuration = 120;

// PUT ?s=session&start=&total= (corps : un morceau de 4 Mo au plus) : envoi vers Drive
export async function PUT(request) {
  const denied = await guard();
  if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  try {
    const session = Buffer.from(sp.get("s") || "", "base64url").toString();
    if (!/^https:\/\/www\.googleapis\.com\/upload\/drive\//.test(session)) throw new Error("session d'envoi invalide");
    const buf = Buffer.from(await request.arrayBuffer());
    return Response.json(await sendChunk(session, buf, Number(sp.get("start")), Number(sp.get("total"))));
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

// GET ?id=&start=&end= : lit un morceau d'un fichier Drive ; ?id=&info=1 : taille et nom
export async function GET(request) {
  const denied = await guard();
  if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  try {
    const id = sp.get("id");
    if (sp.get("info")) return Response.json(await fileInfo(id));
    const buf = await readRange(id, Number(sp.get("start")), Number(sp.get("end")));
    return new Response(buf, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, max-age=86400" } });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
