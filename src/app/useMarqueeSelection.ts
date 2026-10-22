import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

type Point = { x: number; y: number };
type Box = Point & { width: number; height: number };
type Options = {
  selected: string[];
  onSelect: (ids: string[]) => void;
  onEmptyClick?: (clientX: number) => void;
};

/** El rectángulo vive en coordenadas del contenido, incluso al desplazar sus paneles. */
export function useMarqueeSelection(options: Options) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(options); latest.current = options;
  const [box, setBox] = useState<Box | null>(null);
  const [active, setActive] = useState(false);
  const gesture = useRef<{ origin: Point; client: Point; initialClient: Point; initial: string[]; additive: boolean; moved: boolean } | null>(null);
  const point = (client: Point): Point => {
    const node = ref.current!, rect = node.getBoundingClientRect();
    return { x: Math.max(0, Math.min(node.scrollWidth, client.x - rect.left + node.scrollLeft)), y: Math.max(0, Math.min(node.scrollHeight, client.y - rect.top + node.scrollTop)) };
  };
  const onMouseDown = (event: ReactMouseEvent) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("[data-selection-id],button,input,select,textarea,a,[data-no-marquee]")) return;
    event.preventDefault();
    const client = { x: event.clientX, y: event.clientY };
    gesture.current = { origin: point(client), client, initialClient: client, initial: [...latest.current.selected], additive: event.shiftKey || event.ctrlKey || event.metaKey, moved: false };
    setActive(true);
  };
  useEffect(() => {
    if (!active) return;
    const node = ref.current!,doc=node.ownerDocument,win=doc.defaultView!;
    const scrollers: HTMLElement[] = [];
    for (let element: HTMLElement | null = node; element && element !== doc.body; element = element.parentElement) {
      const style = win.getComputedStyle(element);
      if (/(auto|scroll)/.test(style.overflowX + style.overflowY)) scrollers.push(element);
    }
    const update = () => {
      const current = gesture.current; if (!current) return;
      if (!current.moved && Math.hypot(current.client.x - current.initialClient.x, current.client.y - current.initialClient.y) < 4) return;
      current.moved = true;
      const end = point(current.client), start = current.origin;
      const rectangle = { x: Math.max(0, Math.min(start.x, end.x)), y: Math.max(0, Math.min(start.y, end.y)), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
      setBox(rectangle);
      const parent = node.getBoundingClientRect();
      const ids = [...node.querySelectorAll<HTMLElement>("[data-selection-id]")].filter((item) => {
        if (item.dataset.selectionDisabled) return false;
        const rect = item.getBoundingClientRect(), x = rect.left - parent.left + node.scrollLeft, y = rect.top - parent.top + node.scrollTop;
        return x < rectangle.x + rectangle.width && x + rect.width > rectangle.x && y < rectangle.y + rectangle.height && y + rect.height > rectangle.y;
      }).map((item) => item.dataset.selectionId!);
      const selected = current.additive ? [...new Set([...current.initial, ...ids])] : ids;
      if (selected.join("\0") !== latest.current.selected.join("\0")) latest.current.onSelect(selected);
    };
    const move = (event: MouseEvent) => { if (gesture.current) { gesture.current.client = { x: event.clientX, y: event.clientY }; update(); } };
    const finish = (cancel = false) => {
      const current = gesture.current; if (!current) return;
      if (cancel) latest.current.onSelect(current.initial);
      else if (!current.moved) {
        if (!current.additive) latest.current.onSelect([]);
        latest.current.onEmptyClick?.(current.client.x);
      }
      gesture.current = null; setBox(null); setActive(false);
    };
    const up = (event: MouseEvent) => { move(event); finish(); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); finish(true); } };
    const blur = () => finish(true);
    let animation = 0;
    const scroll = () => {
      const current = gesture.current;
      if (current?.moved) {
        for (const element of scrollers) {
          const rect = element.getBoundingClientRect();
          const speed = (value: number, low: number, high: number) => value < low + 22 ? -10 : value > high - 22 ? 10 : 0;
          const style = win.getComputedStyle(element);
          if (/(auto|scroll)/.test(style.overflowX) && current.client.y >= rect.top - 22 && current.client.y <= rect.bottom + 22) element.scrollLeft += speed(current.client.x, rect.left, rect.right);
          if (/(auto|scroll)/.test(style.overflowY) && current.client.x >= rect.left - 22 && current.client.x <= rect.right + 22) element.scrollTop += speed(current.client.y, rect.top, rect.bottom);
        }
        update();
      }
      animation = win.requestAnimationFrame(scroll);
    };
    animation = win.requestAnimationFrame(scroll);
    win.addEventListener("mousemove", move); win.addEventListener("mouseup", up);
    win.addEventListener("keydown", key, true); win.addEventListener("blur", blur);
    return () => {
      win.cancelAnimationFrame(animation);
      win.removeEventListener("mousemove", move); win.removeEventListener("mouseup", up);
      win.removeEventListener("keydown", key, true); win.removeEventListener("blur", blur);
    };
  }, [active]);
  return { ref, onMouseDown, box };
}

export function toggleSelection(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
}
