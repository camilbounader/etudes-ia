import { geminiError } from "@/lib/apiErrors";
import { logUsage } from "@/lib/usage";

// Transcription audio / vidéo par Gemini (API Files : pas de limite de taille de requête)
const BASE = "https://generativelanguage.googleapis.com";

function key() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY manquante dans Vercel");
  return k;
}

export async function geminiUpload(buf, mime, name = "media") {
  const start = await fetch(`${BASE}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": key(),
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(buf.length),
      "X-Goog-Upload-Header-Content-Type": mime,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: name.slice(0, 100) } }),
  });
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!start.ok || !uploadUrl) throw new Error(geminiError(start.status, await start.json().catch(() => ({}))));
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
    body: buf,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(geminiError(res.status, data));
  let file = data.file;
  // les vidéos sont traitées avant d'être utilisables
  for (let i = 0; i < 60 && file.state === "PROCESSING"; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    file = await (await fetch(`${BASE}/v1beta/${file.name}`, { headers: { "x-goog-api-key": key() } })).json();
  }
  if (file.state === "FAILED") throw new Error("Gemini n'a pas pu lire ce fichier audio ou vidéo");
  return file;
}

export async function geminiDelete(file) {
  try {
    await fetch(`${BASE}/v1beta/${file.name}`, { method: "DELETE", headers: { "x-goog-api-key": key() } });
  } catch {}
}

const PROMPTS = {
  slide: "Transcribe this spoken narration of a lecture slide verbatim, in its original language. Plain text, no timestamps, no commentary. If there is no speech, answer exactly: (silence)",
  media:
    "Transcribe this lecture recording verbatim in its original language. Output one line per spoken segment of about 20-40 seconds, each starting with its start time in [mm:ss] format (or [h:mm:ss] after one hour), e.g. '[03:12] text'. No title, no summary, no commentary.",
};

export async function transcribeMedia(buf, mime, { mode = "media", name = "media" } = {}) {
  const model = process.env.GEMINI_VIDEO_MODEL || "gemini-3.5-flash";
  const file = await geminiUpload(buf, mime, name);
  try {
    const res = await fetch(`${BASE}/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key() },
      body: JSON.stringify({
        contents: [{ parts: [{ file_data: { mime_type: file.mimeType || mime, file_uri: file.uri } }, { text: PROMPTS[mode] || PROMPTS.media }] }],
        generationConfig: { maxOutputTokens: 32000, temperature: 0, mediaResolution: "MEDIA_RESOLUTION_LOW" },
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(geminiError(res.status, data));
    await logUsage({
      provider: "gemini",
      model,
      feature: mode === "slide" ? "transcription diapo commentée" : "transcription audio/vidéo",
      input: data.usageMetadata?.promptTokenCount || 0,
      output: data.usageMetadata?.candidatesTokenCount || 0,
    });
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
    return text === "(silence)" ? "" : text;
  } finally {
    geminiDelete(file);
  }
}

// Extension -> type MIME accepté par Gemini
export function mediaMime(name) {
  const ext = String(name).toLowerCase().split(".").pop();
  return (
    { m4a: "audio/mp4", mp3: "audio/mp3", wav: "audio/wav", aac: "audio/aac", ogg: "audio/ogg", flac: "audio/flac", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", m4v: "video/mp4", wma: "audio/x-ms-wma" }[ext] ||
    "application/octet-stream"
  );
}
