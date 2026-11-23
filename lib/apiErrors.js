// Erreurs des API traduites en français, avec la marche à suivre.

export function anthropicError(status, data) {
  const msg = JSON.stringify(data?.error || data || "");
  if (status === 402 || /credit balance|billing_error/i.test(msg)) {
    return "Crédits Anthropic épuisés. Recharge sur console.anthropic.com → Settings → Billing → « Buy credits » (ou active la recharge automatique), puis réessaie.";
  }
  if (/usage limit|spend limit|limit.*reached/i.test(msg)) {
    return "Limite de dépense mensuelle Anthropic atteinte. Augmente-la sur console.anthropic.com → Settings → Limits (« Spend limit »), ou attends le mois prochain.";
  }
  if (status === 401 || /authentication|invalid x-api-key/i.test(msg)) {
    return "Clé Anthropic refusée. Vérifie ANTHROPIC_API_KEY dans Vercel (Settings → Environment Variables), puis Redeploy.";
  }
  if (status === 429 || /rate_limit/i.test(msg)) {
    return "Trop de demandes à Claude en même temps (limite de débit). Attends une minute et réessaie.";
  }
  if (status === 529 || /overloaded/i.test(msg)) {
    return "Les serveurs de Claude sont surchargés. Réessaie dans quelques minutes.";
  }
  return "Claude : " + msg.slice(0, 300);
}

export function geminiError(status, data) {
  const msg = JSON.stringify(data?.error || data || "");
  if (/billing|BILLING/.test(msg) || (status === 403 && /disabled|prepay|credit/i.test(msg))) {
    return "Facturation Gemini inactive ou crédits épuisés. Vérifie sur aistudio.google.com → Get API key → ton projet → Billing (ou console.cloud.google.com → Facturation).";
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(msg)) {
    return "Quota Gemini dépassé. Si tu es en gratuit : active la facturation sur aistudio.google.com. Si tu es en payant : vérifie le plafond de dépense du projet dans la console Google Cloud, ou réessaie dans quelques minutes.";
  }
  if (status === 400 && /API key|API_KEY/i.test(msg)) {
    return "Clé Gemini refusée ou expirée. Vérifie GEMINI_API_KEY dans Vercel, puis Redeploy.";
  }
  return "Gemini : " + msg.slice(0, 300);
}
