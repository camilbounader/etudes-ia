// Analyse d'une transcription collée (sous-titres Panopto, TED, YouTube…).
// Formats reconnus :
//   - Panopto : une ligne de texte, puis une ligne « 16:08 »
//   - TED / YouTube : « 0:12 » ou « 00:00:12 » sur sa propre ligne, ou en début de ligne
//   - texte sans aucun minutage
// Renvoie des passages d'environ 1 000 caractères avec le minutage de début.

const TS = /^\(?\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\)?$/;
const TS_START = /^\(?\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\)?\s+(.+)$/;
const TS_END = /^(.+?)\s+(\d{1,2}:\d{2}(?::\d{2})?)$/;

export function parseTranscript(raw) {
  const lines = String(raw || "")
    .replace(/\u0000/g, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // 1. paires (minutage, texte)
  const cues = [];
  let pendingText = [];
  let lastTs = null;
  // Panopto met le minutage APRÈS le texte ; les autres AVANT.
  const tsAfterText = lines.length > 1 && !TS.test(lines[0]) && TS.test(lines[1]);

  for (const line of lines) {
    let m;
    if ((m = line.match(TS))) {
      if (tsAfterText) {
        if (pendingText.length) cues.push({ ts: m[1], text: pendingText.join(" ") });
        pendingText = [];
      } else {
        if (pendingText.length) cues.push({ ts: lastTs, text: pendingText.join(" ") });
        pendingText = [];
        lastTs = m[1];
      }
    } else if ((m = line.match(TS_START))) {
      if (pendingText.length) cues.push({ ts: lastTs, text: pendingText.join(" ") });
      pendingText = [];
      cues.push({ ts: m[1], text: m[2] });
      lastTs = m[1];
    } else if ((m = line.match(TS_END))) {
      cues.push({ ts: m[2], text: m[1] });
    } else {
      pendingText.push(line);
    }
  }
  if (pendingText.length) cues.push({ ts: tsAfterText ? null : lastTs, text: pendingText.join(" ") });

  // 2. regroupement en passages
  const chunks = [];
  let cur = null;
  for (const c of cues) {
    if (!cur) cur = { ts: c.ts, text: "" };
    cur.text += (cur.text ? " " : "") + c.text;
    if (!cur.ts && c.ts) cur.ts = c.ts;
    if (cur.text.length >= 1000) {
      chunks.push(cur);
      cur = null;
    }
  }
  if (cur && cur.text.trim()) chunks.push(cur);
  return {
    hasTimestamps: cues.some((c) => c.ts),
    chunks: chunks.map((c) => ({ ts: c.ts || null, text: c.text.trim() })),
    text: cues.map((c) => (c.ts ? `[${c.ts}] ` : "") + c.text).join("\n"),
  };
}
