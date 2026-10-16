'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Info, X } from 'lucide-react';
import './context-note.css';

type NoteProps = { label: string; children: ReactNode };

export function InfoHint(props: NoteProps) {
  return <ContextNote {...props} hint />;
}

export function ContextBadge({ tone = 'neutral', ...props }: NoteProps & { tone?: 'neutral' | 'warning' }) {
  return <ContextNote {...props} tone={tone} />;
}

function ContextNote({ label, children, hint = false, tone = 'neutral' }: NoteProps & { hint?: boolean; tone?: 'neutral' | 'warning' }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinned = useRef(false);
  const restoringFocus = useRef(false);
  const [open, setOpen] = useState(false);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  const dismiss = useCallback((restore = false) => {
    cancelClose();
    pinned.current = false;
    setOpen(false);
    if (restore) {
      restoringFocus.current = true;
      trigger.current?.focus({ preventScroll: true });
      restoringFocus.current = false;
    }
  }, [cancelClose]);

  function show(pin = false) {
    cancelClose();
    pinned.current = pin;
    window.dispatchEvent(new CustomEvent('blackfin:context-open', { detail: id }));
    setOpen(true);
  }

  function leave() {
    if (!pinned.current) closeTimer.current = setTimeout(() => dismiss(), 160);
  }

  function blur(next: EventTarget | null) {
    if (next instanceof Node && (trigger.current?.contains(next) || panel.current?.contains(next))) return;
    dismiss();
  }

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  useLayoutEffect(() => {
    if (!open || !trigger.current || !panel.current) return;
    const anchor = trigger.current;
    const popup = panel.current;
    popup.showPopover();
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const viewport = window.visualViewport;
      const leftEdge = viewport?.offsetLeft ?? 0;
      const topEdge = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const gap = 8;
      const inset = 12;
      popup.style.maxWidth = `${Math.max(0, width - inset * 2)}px`;
      popup.style.maxHeight = `${Math.max(0, height - inset * 2)}px`;
      const popupWidth = popup.offsetWidth;
      const popupHeight = popup.offsetHeight;
      const left = Math.max(leftEdge + inset, Math.min(rect.left, leftEdge + width - popupWidth - inset));
      const below = rect.bottom + gap;
      const above = rect.top - popupHeight - gap;
      const preferredTop = below + popupHeight <= topEdge + height - inset ? below : above;
      const top = Math.max(topEdge + inset, Math.min(preferredTop, topEdge + height - popupHeight - inset));
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
      popup.style.visibility = 'visible';
    };
    place();
    if (!hint) popup.focus({ preventScroll: true });
    const resize = new ResizeObserver(place);
    resize.observe(popup);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    return () => {
      resize.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
    };
  }, [open, hint]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !trigger.current?.contains(target) && !panel.current?.contains(target)) dismiss();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Consume Escape before a containing property inspector handles it.
      event.preventDefault();
      event.stopPropagation();
      dismiss(true);
    };
    const another = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id) dismiss();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('blackfin:context-open', another);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('blackfin:context-open', another);
    };
  }, [open, id, dismiss]);

  return <>
    <button
      ref={trigger}
      type="button"
      className={hint ? 'context-note-trigger context-info-hint' : `context-note-trigger context-badge context-badge-${tone}`}
      aria-label={hint ? label : undefined}
      aria-expanded={open}
      aria-controls={open ? id : undefined}
      aria-describedby={hint && open ? id : undefined}
      aria-haspopup={hint ? undefined : 'dialog'}
      onClick={() => pinned.current && open ? dismiss() : show(true)}
      onPointerEnter={event => { if (hint && event.pointerType === 'mouse' && !pinned.current) show(); }}
      onPointerLeave={() => { if (hint) leave(); }}
      onFocus={event => { if (hint && !restoringFocus.current && event.currentTarget.matches(':focus-visible')) show(); }}
      onBlur={event => blur(event.relatedTarget)}
    >
      {hint ? <Info size={14} aria-hidden="true" /> : <><span>{label}</span><Info size={12} aria-hidden="true" /></>}
    </button>
    {open && (
      <div
        ref={panel}
        id={id}
        popover="manual"
        role={hint ? 'tooltip' : 'dialog'}
        aria-label={hint ? undefined : label}
        tabIndex={hint ? undefined : -1}
        className={`context-note-panel ${hint ? 'context-note-tooltip' : 'context-note-popover'}`}
        onPointerEnter={cancelClose}
        onPointerLeave={() => { if (hint) leave(); }}
        onBlur={event => blur(event.relatedTarget)}
        onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(true); } }}
      >
        {!hint && <div className="context-note-heading"><strong>{label}</strong><button type="button" className="context-note-close" aria-label={`Close ${label}`} onClick={() => dismiss(true)}><X size={15} aria-hidden="true" /></button></div>}
        <div className="context-note-body">{children}</div>
      </div>
    )}
  </>;
}
