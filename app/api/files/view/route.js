import { isAuthed } from "@/lib/auth";

// Ouvre un fichier d'origine rangé dans Google Drive
export async function GET(request) {
  const url = new URL(request.url);
  if (!(await isAuthed())) return Response.redirect(`${url.origin}/login`, 302);
  const id = (url.searchParams.get("id") || "").split("#")[0];
  return Response.redirect(`https://drive.google.com/file/d/${encodeURIComponent(id)}/view`, 302);
}
