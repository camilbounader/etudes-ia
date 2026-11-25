import { guard } from "@/lib/auth";
import { geminiError } from "@/lib/apiErrors";
import { logUsage } from "@/lib/usage";

export const maxDuration = 120;

const PROMPT = `Extract all the useful text from this screenshot of university course material
(lecture slides, a Canvas course page, or a Panopto video table of contents).
Rules:
- Ignore browser/menus/player interface elements.
- Keep the structure: titles on their own line, bullet points as "- ".
- If several slides are visible, start each one with a line "### Slide: <slide title>".
- If timestamps are shown next to slides or chapters (e.g. 2:05), keep them at the start of the line as [2:05].
- Briefly describe charts, diagrams or figures in one line starting with "[Figure]".
- Output plain text only, in the original language, no commentary.`;

const NOTES_PROMPT = `Transcribe all the text in this photo or screenshot of a student's notes, draft, whiteboard or document (handwritten or typed), in its original language.
Keep the structure (headings, bullets, arrows as "->"). Describe any diagram in one line starting with "[Schéma]". Mark unreadable words as [?]. Output plain text only, no commentary.`;

// POST { image: base64 JPEG, mode?: "notes" } : texte d'une capture d'écran (Gemini vision)
export async function POST(request) {
  const denied = await guard();
  if (denied) return denied;
  const { image, mode } = await request.json();
  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ error: "GEMINI_API_KEY manquante" }, { status: 500 });
  const model = process.env.GEMINI_VISION_MODEL || "gemini-3.5-flash";
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: "image/jpeg", data: image } }, { text: mode === "notes" ? NOTES_PROMPT : PROMPT }] }],
        generationConfig: { maxOutputTokens: 4000, temperature: 0 },
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(geminiError(res.status, data));
    await logUsage({
      provider: "gemini",
      model,
      feature: "lecture de captures",
      input: data.usageMetadata?.promptTokenCount || 0,
      output: data.usageMetadata?.candidatesTokenCount || 0,
    });
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
    return Response.json({ text });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
