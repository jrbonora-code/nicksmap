'use client';
// The list panel's width: a draggable, keyboard-operable divider between the list and the map, and a handle on the
// map's left edge that re-opens a collapsed list. The width is remembered in this browser when storage allows and
// works without it; double-clicking the divider returns to the default.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronRight } from 'lucide-react';

export const LIST_MIN = 360;
export const listMax = () => Math.round(window.innerWidth * 0.6);
const STEP = 24;
const clamp = (n: number) => Math.round(Math.min(listMax(), Math.max(LIST_MIN, n)));

// A tiny external store per storage key: localStorage when it works, memory otherwise, one listener set for both.
type Store = { memory: number | null; listeners: Set<() => void>; read: () => number | null; subscribe: (listener: () => void) => () => void; write: (value: number | null) => void };
const stores = new Map<string, Store>();
function storeFor(key: string): Store {
  const found = stores.get(key);
  if (found) return found;
  const store: Store = {
    memory: null, listeners: new Set(),
    read() {
      try {
        const value = Number(window.localStorage.getItem(key));
        if (Number.isFinite(value) && value > 0) return value;
      } catch { /* storage refused (private window, blocked site data): fall back to memory */ }
      return store.memory;
    },
    subscribe(listener) {
      store.listeners.add(listener);
      window.addEventListener('storage', listener);
      return () => { store.listeners.delete(listener); window.removeEventListener('storage', listener); };
    },
    write(value) {
      store.memory = value;
      try { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, String(value)); } catch { /* memory keeps it for this page */ }
      for (const listener of store.listeners) listener();
    },
  };
  stores.set(key, store);
  return store;
}
/** The remembered width, or null for the stylesheet's default (600px, 480px below 1440px). Each page passes its own key. */
export function useListWidth(key = 'blackfin.oz-eb5.list-width') {
  const store = storeFor(key);
  const width = useSyncExternalStore(store.subscribe, store.read, () => null);
  return { width, setWidth: (value: number | null) => store.write(value === null ? null : clamp(value)) };
}

/** The divider. While dragging it reports a live width; on release it stores the width and asks the map to resize. */
export function ListDivider({ listRef, onLive, onCommit, onReset }: {
  listRef: React.RefObject<HTMLElement | null>; onLive: (width: number | null) => void; onCommit: (width: number) => void; onReset: () => void;
}) {
  const [now, setNow] = useState(0);
  const [max, setMax] = useState(0);
  const drag = useRef<{ left: number; width: number } | null>(null);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    // Width and the 60% ceiling are read in the observer, so they are real numbers after hydration and on every resize.
    const observer = new ResizeObserver(() => { setNow(Math.round(list.getBoundingClientRect().width)); setMax(listMax()); });
    observer.observe(list);
    return () => observer.disconnect();
  }, [listRef]);
  return <div
    className="oz-divider" role="separator" aria-orientation="vertical" aria-label="Resize list" tabIndex={0}
    aria-valuenow={now} aria-valuemin={LIST_MIN} aria-valuemax={max}
    onPointerDown={event => {
      const list = listRef.current;
      if (!list || event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { left: list.getBoundingClientRect().left, width: list.getBoundingClientRect().width };
      document.body.classList.add('oz-resizing');
    }}
    onPointerMove={event => { if (drag.current) { const width = clamp(event.clientX - drag.current.left); drag.current.width = width; onLive(width); } }}
    onPointerUp={event => {
      if (!drag.current) return;
      event.currentTarget.releasePointerCapture(event.pointerId);
      const { width } = drag.current;
      drag.current = null;
      document.body.classList.remove('oz-resizing');
      onLive(null);
      onCommit(width);
    }}
    onPointerCancel={() => { drag.current = null; document.body.classList.remove('oz-resizing'); onLive(null); }}
    onDoubleClick={onReset}
    onKeyDown={event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      // The measured width, not the last observed one, so quick repeated presses each move a full step.
      onCommit(clamp((listRef.current?.getBoundingClientRect().width || now || LIST_MIN) + (event.key === 'ArrowRight' ? STEP : -STEP)));
    }}
  />;
}

/** The tab on the map's left edge while the list is collapsed: click, or drag right, to bring the list back. */
export function ShowListHandle({ onOpen }: { onOpen: (width: number | null) => void }) {
  const start = useRef<{ x: number; left: number } | null>(null);
  const [offset, setOffset] = useState(0);
  return <button
    type="button" className="oz-showlist" aria-label="Show list" title="Show list" style={offset ? { transform: `translate(${offset}px, -50%)` } : undefined}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      start.current = { x: event.clientX, left: event.currentTarget.parentElement?.getBoundingClientRect().left ?? 0 };
    }}
    onPointerMove={event => { if (start.current) setOffset(Math.max(0, event.clientX - start.current.x)); }}
    onPointerUp={event => {
      const s = start.current;
      start.current = null;
      setOffset(0);
      if (!s) return;
      const moved = event.clientX - s.x;
      // A drag past a few pixels opens the list at the dropped width; a click opens it at its last width.
      onOpen(moved > 24 ? clamp(event.clientX - s.left) : null);
    }}
    onPointerCancel={() => { start.current = null; setOffset(0); }}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(null); } }}
  ><ChevronRight size={20} aria-hidden="true" /></button>;
}
