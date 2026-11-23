// Photos de fond par défaut (Norvège, fournies par Camil) et réglages
export const DEFAULT_PHOTOS = Array.from({ length: 10 }, (_, i) => `/backgrounds/norvege-${String(i + 1).padStart(2, "0")}.jpg`);
export const DEFAULT_BG = { photos: [], useDefaults: true, opacity: 0.82, interval: 90 };

export function photoList(bg) {
  const s = { ...DEFAULT_BG, ...(bg || {}) };
  const list = [...(s.useDefaults ? DEFAULT_PHOTOS : []), ...(s.photos || []).map((p) => p.url)];
  return list.length ? list : DEFAULT_PHOTOS;
}
