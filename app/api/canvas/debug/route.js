import { guard } from "@/lib/auth";
import { getPage, videosInHtml } from "@/lib/canvas";

// GET ?course=43925&page=3-dot-1-... : montre les iframes et liens d'une page
// Canvas, pour comprendre comment les vidéos y sont intégrées.
export async function GET(request) {
  const denied = await guard();
  if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  try {
    const page = await getPage(sp.get("course"), sp.get("page"));
    const tags = [...String(page.body || "").matchAll(/<(iframe|a|video|object|embed)\b[^>]*>/gi)].map((m) => m[0].slice(0, 400));
    return Response.json({ title: page.title, detected: videosInHtml(page.body), tags });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
