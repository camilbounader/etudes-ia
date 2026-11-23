// Accès en lecture à l'API Canvas (uit.instructure.com) avec le jeton personnel.

function base() {
  const b = process.env.CANVAS_BASE_URL || "https://uit.instructure.com";
  return b.replace(/\/+$/, "");
}

function token() {
  const t = process.env.CANVAS_TOKEN;
  if (!t) throw new Error("CANVAS_TOKEN manquant dans Vercel");
  return t;
}

// GET avec pagination (en-tête Link: rel="next")
export async function canvasGet(path, { all = true } = {}) {
  let url = path.startsWith("http") ? path : `${base()}/api/v1${path}`;
  const out = [];
  for (let guard = 0; url && guard < 50; guard++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Canvas ${res.status} sur ${path} : ${txt.slice(0, 200)}`);
    }
    const data = await res.json();
    if (!Array.isArray(data)) return data;
    out.push(...data);
    if (!all) break;
    const link = res.headers.get("link") || "";
    const next = link.split(",").find((l) => l.includes('rel="next"'));
    url = next ? next.match(/<([^>]+)>/)?.[1] : null;
  }
  return out;
}

export async function listCourses() {
  const courses = await canvasGet(`/courses?enrollment_state=active&per_page=100`);
  return courses
    .filter((c) => c.name)
    .map((c) => ({ id: c.id, name: c.name, code: c.course_code }));
}

export async function listModules(courseId) {
  const modules = await canvasGet(`/courses/${courseId}/modules?include[]=items&per_page=100`);
  for (const m of modules) {
    if (!m.items && m.items_url) m.items = await canvasGet(m.items_url + (m.items_url.includes("?") ? "&" : "?") + "per_page=100");
  }
  return modules;
}

export async function getPage(courseId, pageUrl) {
  return canvasGet(`/courses/${courseId}/pages/${encodeURIComponent(pageUrl)}`);
}

export async function getFile(fileId) {
  return canvasGet(`/files/${fileId}`);
}

// Identifiants des fichiers liés dans le HTML d'une page Canvas
export function fileIdsInHtml(html) {
  const ids = new Set();
  for (const m of String(html || "").matchAll(/\/files\/(\d+)/g)) ids.add(Number(m[1]));
  return [...ids];
}

// HTML -> texte lisible (titres et listes conservés en lignes)
export function htmlToText(html) {
  return String(html || "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|ul|ol|table)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function canvasPageLink(courseId, pageUrl) {
  return `${base()}/courses/${courseId}/pages/${pageUrl}`;
}

// Titre normalisé pour rapprocher « 3.1. Climate… » et « 3.1 Climate… »
export function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Vidéos intégrées dans une page Canvas : Panopto (souvent via un outil
// externe Canvas, adresse encodée), TED et YouTube. Analyse balise par
// balise, dans l'ordre de la page, pour garder le bon titre.
function detectVideo(u) {
  let p;
  if ((p = u.match(/(https?:\/\/[a-z0-9.-]*panopto\.[a-z.]+)\/Panopto\/Pages\/(?:Viewer|Embed)\.aspx\?id=([0-9a-f-]{36})/i)))
    return { key: `panopto:${p[2].toLowerCase()}`, kind: "panopto", url: `${p[1]}/Panopto/Pages/Viewer.aspx?id=${p[2]}` };
  if ((p = u.match(/https?:\/\/(?:www\.|embed\.)?ted\.com\/talks\/(?:lang\/[a-z-]+\/)?([a-z0-9_]+)/i)))
    return { key: `ted:${p[1].toLowerCase()}`, kind: "ted", url: `https://www.ted.com/talks/${p[1]}` };
  if ((p = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)))
    return { key: `youtube:${p[1]}`, kind: "youtube", url: `https://www.youtube.com/watch?v=${p[1]}` };
  return null;
}

// décode plusieurs fois (adresses encodées dans des adresses)
function deepDecode(u) {
  let out = u.replace(/&amp;/g, "&");
  let all = out;
  for (let i = 0; i < 3; i++) {
    try {
      const d = decodeURIComponent(out);
      if (d === out) break;
      out = d;
      all += " " + d;
    } catch {
      break;
    }
  }
  return all;
}

export function videosInHtml(html) {
  const videos = [];
  const seen = new Set();
  for (const tag of String(html || "").matchAll(/<(iframe|a)\b[^>]*>/gi)) {
    const t = tag[0];
    const isIframe = /^<iframe/i.test(t);
    const raw = (t.match(/\s(?:src|href|data-url)="([^"]*)"/i) || [])[1];
    if (!raw) continue;
    const url = deepDecode(raw);
    let v = detectVideo(url);
    // Outil externe Canvas (LTI) intégré sans adresse Panopto lisible :
    // on le garde comme vidéo « Canvas » (titre de l'iframe).
    if (!v && isIframe && /external_tools\/retrieve|lti|panopto/i.test(url)) {
      const id = (
        url.match(/context_delivery=([0-9a-f-]{36})/i) ||
        url.match(/resource_link_lookup_uuid=([0-9a-f-]+)/i) ||
        url.match(/[?&](?:id|session_id)=([0-9a-f-]{20,})/i) ||
        []
      )[1];
      v = {
        key: `lti:${id || raw.slice(-60)}`,
        kind: /panopto/i.test(url) ? "panopto" : "canvas",
        url: raw.startsWith("http") ? raw.replace(/&amp;/g, "&") : null,
      };
    }
    if (!v || seen.has(v.key)) continue;
    seen.add(v.key);
    const title = (t.match(/\stitle="([^"]*)"/i) || [])[1];
    videos.push({
      ...v,
      title:
        title && !/^(external tool|lti|panopto|embedded|outil externe)/i.test(title.trim())
          ? title
          : v.kind === "ted"
            ? `TED : ${v.url.split("/talks/")[1].replace(/_/g, " ")}`
            : `Vidéo ${videos.length + 1}`,
    });
  }
  return videos;
}

// Liens externes d'une page Canvas (articles, rapports, sites) : ni Canvas,
// ni vidéo, ni courriel. Titre = texte du lien.
export function webLinksInHtml(html) {
  const out = [];
  const seen = new Set();
  for (const m of String(html || "").matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = ((m[1].match(/\shref="([^"]*)"/i) || [])[1] || "").replace(/&amp;/g, "&").trim();
    if (!/^https?:\/\//i.test(href)) continue;
    if (/instructure\.com|panopto\.|ted\.com|youtube\.com|youtu\.be|mailto:|uit\.no\/(?:om|kontakt)/i.test(href)) continue;
    const url = href.split("#")[0];
    if (seen.has(url)) continue;
    seen.add(url);
    const title = htmlToText(m[2]).replace(/\s+/g, " ").trim() || url;
    out.push({ url, title: title.slice(0, 200) });
  }
  return out;
}

// Texte principal d'une page web (article, main ou body, sans menus)
export function mainTextFromHtml(html) {
  let h = String(html || "").replace(/<(script|style|noscript|svg|nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, "");
  const pick = h.match(/<article[\s\S]*?<\/article>/i) || h.match(/<main[\s\S]*?<\/main>/i) || h.match(/<body[\s\S]*?<\/body>/i);
  return htmlToText(pick ? pick[0] : h);
}
