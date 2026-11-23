"use client";

import { useEffect, useState } from "react";
import { DEFAULT_BG, photoList } from "@/lib/backgrounds";

// Fond photo semi-transparent, qui change toutes les N secondes (fondu).
export default function Background() {
  const [cfg, setCfg] = useState(DEFAULT_BG);
  const [list, setList] = useState(photoList(DEFAULT_BG));
  const [idx, setIdx] = useState(0);
  const [prev, setPrev] = useState(null);

  useEffect(() => {
    setIdx(Math.floor(Math.random() * list.length));
    fetch("/api/settings?key=backgrounds")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.value) return;
        const c = { ...DEFAULT_BG, ...d.value };
        const l = photoList(c);
        setCfg(c);
        setList(l);
        setIdx(Math.floor(Math.random() * l.length));
      })
      .catch(() => {});
    const onChange = (e) => {
      const c = { ...DEFAULT_BG, ...e.detail };
      setCfg(c);
      setList(photoList(c));
    };
    window.addEventListener("bg-settings", onChange);
    return () => window.removeEventListener("bg-settings", onChange);
  }, []);

  useEffect(() => {
    if (list.length < 2) return;
    const t = setInterval(() => {
      setIdx((i) => {
        setPrev(i);
        return (i + 1) % list.length;
      });
    }, Math.max(20, Number(cfg.interval) || 90) * 1000);
    return () => clearInterval(t);
  }, [list, cfg.interval]);

  const layer = (src, visible, key) => (
    <div
      key={key}
      className="absolute inset-0 bg-cover bg-center transition-opacity duration-[2000ms]"
      style={{ backgroundImage: `url("${src}")`, opacity: visible ? 1 : 0 }}
    />
  );

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {prev !== null && list[prev] && layer(list[prev], false, `p${prev}`)}
      {list[idx] && layer(list[idx], true, `c${idx}`)}
      <div className="absolute inset-0" style={{ background: `rgb(var(--veil) / ${cfg.opacity})` }} />
    </div>
  );
}
