"use client";

// Lecture à voix haute (synthèse vocale du navigateur, gratuite et locale).

export function guessLang(text) {
  const t = ` ${String(text).toLowerCase()} `;
  const fr = (t.match(/ (le|la|les|des|est|une|et|que|pour|dans|du) /g) || []).length;
  const en = (t.match(/ (the|is|and|of|to|in|that|for|with|are) /g) || []).length;
  return fr >= en ? "fr-FR" : "en-GB";
}

// Texte lisible : sans marqueurs, titres markdown ni références entre parenthèses
export function speakableText(text) {
  return String(text || "")
    .replace(/⟦\d+⟧/g, "")
    .replace(/\([^()]*\b(19|20)\d{2}[^()]*\)/g, "")
    .replace(/[#*>|`_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function speak(text, { lang, onEnd } = {}) {
  if (typeof window === "undefined" || !window.speechSynthesis) return false;
  window.speechSynthesis.cancel();
  const clean = speakableText(text);
  const l = lang || guessLang(clean);
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find((v) => v.lang === l && /natural|neural|google|microsoft/i.test(v.name)) || voices.find((v) => v.lang?.startsWith(l.slice(0, 2)));
  // découpe en phrases (certains navigateurs coupent les textes longs)
  const parts = clean.match(/[^.!?]+[.!?]*/g) || [clean];
  parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p.trim());
    u.lang = l;
    if (voice) u.voice = voice;
    u.rate = 1.02;
    if (i === parts.length - 1 && onEnd) u.onend = onEnd;
    window.speechSynthesis.speak(u);
  });
  return true;
}

export function stopSpeaking() {
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}
