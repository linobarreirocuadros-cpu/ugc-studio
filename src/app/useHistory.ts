import { useCallback, useReducer, useRef } from "react";

// Deshacer / rehacer: guardamos copias del proyecto (son objetos inmutables, así que es barato).
// El estado vive en un ref para que `current()` devuelva siempre la última versión, incluso
// entre varios cambios seguidos del chat de IA antes de que React vuelva a dibujar.
export function useHistory<T>(initial: T | (() => T), limit = 200) {
  const state = useRef<{ past: T[]; present: T; future: T[] } | null>(null);
  if (state.current === null) {
    state.current = {
      past: [],
      present: typeof initial === "function" ? (initial as () => T)() : initial,
      future: [],
    };
  }
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const apply = useCallback(
    (fn: (prev: T) => T) => {
      const s = state.current!;
      const next = fn(s.present);
      if (next === s.present) return;
      state.current = { past: [...s.past, s.present].slice(-limit), present: next, future: [] };
      rerender();
    },
    [limit],
  );

  const undo = useCallback(() => {
    const s = state.current!;
    if (s.past.length === 0) return;
    state.current = { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] };
    rerender();
  }, []);

  const redo = useCallback(() => {
    const s = state.current!;
    if (s.future.length === 0) return;
    state.current = { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) };
    rerender();
  }, []);

  const current = useCallback(() => state.current!.present, []);
  // Solo metadatos derivados (p. ej. proxies): no interrumpir Deshacer ni Rehacer.
  const annotate=useCallback((fn:(value:T)=>T)=>{
    const s=state.current!,present=fn(s.present);
    state.current={past:s.past.map(fn),present,future:s.future.map(fn)};
    if(present!==s.present)rerender();
  },[]);
  const reset=useCallback((present:T)=>{state.current={past:[],present,future:[]};rerender();},[]);

  return {
    value: state.current.present,
    current,
    annotate,
    reset,
    apply,
    undo,
    redo,
    canUndo: state.current.past.length > 0,
    canRedo: state.current.future.length > 0,
  };
}
