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
