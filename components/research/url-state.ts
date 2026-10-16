'use client';
// Page state that lives in the URL, shared by the research pages. Selections and filters push a history entry; map
// moves and similar replace it. Back and Forward restore it, and bump `restored` so a page can reset any draft input
// (a search box) from the restored state. Each page supplies its own pure parse and serialise.
import { useCallback, useEffect, useState } from 'react';

type Params = { get(key: string): string | null };
export function useUrlState<T extends object>(initialQuery: string, parse: (params: Params) => T, serialise: (state: T) => string) {
  const [state, setState] = useState<T>(() => parse(new URLSearchParams(initialQuery)));
  const [restored, setRestored] = useState(0);
  const update = useCallback((patch: Partial<T>, history: 'push' | 'replace' = 'push') => {
    setState(prev => {
      const next = { ...prev, ...patch };
      const query = serialise(next);
      const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
      if (url !== `${window.location.pathname}${window.location.search}`) window.history[history === 'push' ? 'pushState' : 'replaceState'](null, '', url);
      return next;
    });
  }, [serialise]);
  useEffect(() => {
    const onPop = () => { setState(parse(new URLSearchParams(window.location.search))); setRestored(n => n + 1); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [parse]);
  return [state, update, restored] as const;
}
