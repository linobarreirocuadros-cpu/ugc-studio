import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { normalizePanelWidth, TIMELINE_PANEL_WIDTHS, type TimelinePanel } from "./timelinePanels";

export function useTimelinePanelWidth<T extends HTMLElement>(panel: TimelinePanel, label: string) {
  const key = `ugc-studio:timeline:${panel}-width`, limits = TIMELINE_PANEL_WIDTHS[panel];
  const [width, setWidth] = useState(() => { try { return normalizePanelWidth(panel, JSON.parse(localStorage.getItem(key) ?? "null")); } catch { return limits.initial; } });
  const ref = useRef<T>(null), cleanup = useRef<(() => void) | null>(null);
  const [size, setSize] = useState({ width, height: 300 });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(width)); } catch { /* almacenamiento deshabilitado */ } }, [key, width]);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const measure = () => { const next = { width: el.clientWidth, height: el.clientHeight }; setSize(old => old.width === next.width && old.height === next.height ? old : next); };
    const observer = new ResizeObserver(measure); observer.observe(el); measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => cleanup.current?.(), []);
  const max = () => Math.max(limits.min, Math.min(limits.max, (ref.current?.parentElement?.clientWidth ?? 1000) * limits.fraction));
  const resize = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
    cleanup.current?.();
    const x = e.clientX, start = ref.current?.getBoundingClientRect().width ?? width, original = width;
    const move = (event: globalThis.PointerEvent) => setWidth(normalizePanelWidth(panel, Math.min(max(), start + event.clientX - x)));
    const finish = (cancel: boolean) => { stop(); if (cancel) setWidth(original); };
    const up = () => finish(false), cancel = () => finish(true);
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); } };
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); window.removeEventListener("blur", cancel); window.removeEventListener("keydown", keydown, true); document.body.classList.remove("timeline-inner-resizing"); cleanup.current = null; };
    cleanup.current = stop; document.body.classList.add("timeline-inner-resizing");
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel); window.addEventListener("blur", cancel); window.addEventListener("keydown", keydown, true);
  };
  const separator = <div className={`timeline-inner-divider ${panel}-divider`} role="separator" aria-label={label} aria-orientation="vertical" aria-valuemin={limits.min} aria-valuemax={Math.round(max())} aria-valuenow={Math.round(size.width)} tabIndex={0} data-no-marquee onPointerDown={resize} onDoubleClick={() => setWidth(limits.initial)} title="Arrastra para ajustar el ancho · Doble clic para restablecer" onKeyDown={e => { const delta = e.key === "ArrowLeft" ? -4 : e.key === "ArrowRight" ? 4 : 0; if (delta) { e.preventDefault(); e.stopPropagation(); setWidth(normalizePanelWidth(panel, Math.min(max(), size.width + delta))); } }}/>
  const style: CSSProperties = { width, minWidth: limits.min, maxWidth: `${limits.fraction * 100}%` };
  return { ref, size, style, separator };
}
