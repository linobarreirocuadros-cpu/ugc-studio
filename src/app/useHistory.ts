import { useCallback, useState } from "react";

// Deshacer / rehacer: guardamos copias del proyecto (son objetos inmutables, así que es barato).
export function useHistory<T>(initial: T | (() => T), limit = 200) {
  const [state, setState] = useState(() => ({
    past: [] as T[],
    present: typeof initial === "function" ? (initial as () => T)() : initial,
    future: [] as T[],
  }));

  const apply = useCallback(
    (fn: (prev: T) => T) =>
      setState((s) => {
        const next = fn(s.present);
        if (next === s.present) return s;
        return { past: [...s.past, s.present].slice(-limit), present: next, future: [] };
      }),
    [limit],
  );

  const undo = useCallback(
    () =>
      setState((s) =>
        s.past.length === 0
          ? s
          : { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] },
      ),
    [],
  );

  const redo = useCallback(
    () =>
      setState((s) =>
        s.future.length === 0
          ? s
          : { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) },
      ),
    [],
  );

  return {
    value: state.present,
    apply,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
