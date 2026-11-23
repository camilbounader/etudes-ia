"use client";

import Link from "next/link";

// Boutons « chapitre précédent / suivant »
export default function ChapterNav({ chapter }) {
  if (!chapter?.prev && !chapter?.next) return null;
  const sameModule = (x) => x && x.module_title === chapter.module_title;
  return (
    <div className="flex justify-between gap-3 text-sm">
      {chapter.prev ? (
        <Link href={`/chapter/${chapter.prev.id}`} className="px-3 py-2 rounded bg-white border hover:bg-slate-50 max-w-[48%]">
          ← {chapter.prev.title}
          {!sameModule(chapter.prev) && <span className="block text-xs text-slate-500">{chapter.prev.module_title}</span>}
        </Link>
      ) : (
        <span />
      )}
      {chapter.next ? (
        <Link href={`/chapter/${chapter.next.id}`} className="px-3 py-2 rounded bg-white border hover:bg-slate-50 text-right max-w-[48%]">
          {chapter.next.title} →
          {!sameModule(chapter.next) && <span className="block text-xs text-slate-500">{chapter.next.module_title}</span>}
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}
