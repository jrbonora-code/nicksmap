'use client';
// Small shared pieces of the OZ / EB-5 page: the class glyphs, tier swatches, the palette, formatters and the fetch hook.
import { useEffect, useState } from 'react';
import { OZ_EB5_STATE_CODES, type OzEb5Class } from '../../lib/research/oz-eb5';
import type { Oz2027Tier } from '../../lib/research/oz2027';

// The palette passes the colour-vision-deficiency check in docs/DESIGN.md; each class also has its own shape.
export const CLASS_COLOURS: Record<OzEb5Class, string> = {
  rural_clear: '#1c6e8c', rural_interpretation_dependent: '#c98a0c', not_rural_place_per_iiusa: '#b2452e', unknown: '#7b8990', not_rural_msa: '#9aa7ad',
};
export const INTERP_EDGE = '#7a5208';
export const CLASS_LABELS: Record<OzEb5Class, string> = {
  rural_clear: 'Rural clear', rural_interpretation_dependent: 'Interpretation dependent', not_rural_place_per_iiusa: 'Not rural (place)',
  not_rural_msa: 'Not rural (metro)', unknown: 'Unknown',
};
export const TIER_COLOURS: Record<Oz2027Tier, string> = {
  certified: '#0e3b4c', nominated: '#1f6680', state_recommended: '#3f8ba6', draft_for_comment: '#7db3c6', local_recommended: '#bcd8e2', eligible: '#eef3f5',
};
export const TIER_EDGE: Record<Oz2027Tier, string> = {
  certified: '#0e3b4c', nominated: '#1f6680', state_recommended: '#3f8ba6', draft_for_comment: '#5e9ab0', local_recommended: '#8fb9c8', eligible: '#aebec5',
};
export const TIER_LABELS: Record<Oz2027Tier, string> = {
  certified: 'Certified', nominated: 'Nominated', state_recommended: 'State recommended', draft_for_comment: 'Draft for comment', local_recommended: 'Locally recommended', eligible: 'Eligible',
};
export const STATE_ABBR: Record<string, string> = Object.fromEntries(Object.entries(OZ_EB5_STATE_CODES).map(([code, name]) => [name, code]));

export function ClassGlyph({ cls, size = 14 }: { cls: OzEb5Class; size?: number }) {
  const c = CLASS_COLOURS[cls];
  const h = size / 2;
  return <svg className="oz-glyph" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
    {cls === 'rural_clear' && <circle cx={h} cy={h} r={h - 2} fill={c} />}
    {cls === 'rural_interpretation_dependent' && <path d={`M${h} 1 L${size - 1} ${h} L${h} ${size - 1} L1 ${h} Z`} fill={c} stroke={INTERP_EDGE} strokeWidth=".9" />}
    {cls === 'not_rural_place_per_iiusa' && <circle cx={h} cy={h} r={h - 2.5} fill="none" stroke={c} strokeWidth="2.2" />}
    {cls === 'unknown' && <rect x="2" y="2" width={size - 4} height={size - 4} fill={c} />}
    {cls === 'not_rural_msa' && <rect x="2" y="2" width={size - 4} height={size - 4} fill="none" stroke={c} strokeWidth="1.2" strokeDasharray="2 2" />}
  </svg>;
}
export function ClassLabel({ cls }: { cls: OzEb5Class }) {
  return <span className="oz-cl"><ClassGlyph cls={cls} />{CLASS_LABELS[cls]}</span>;
}
export function TierSwatch({ tier }: { tier: Oz2027Tier }) {
  return <span className="oz-sw" aria-hidden="true" style={{ background: TIER_COLOURS[tier], borderColor: TIER_EDGE[tier] }} />;
}
export function TierLabel({ tier }: { tier: Oz2027Tier }) {
  return <span className="oz-cl"><TierSwatch tier={tier} />{TIER_LABELS[tier]}</span>;
}
/** One field/value row of a drawer section. A null value reads as a dash, never as zero. */
export function Fv({ label, children }: { label: string; children: React.ReactNode }) {
  return <><dt>{label}</dt><dd>{children === null || children === undefined || children === '' ? <span className="oz-dash">—</span> : children}</dd></>;
}

export const int = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('en-US'));
export const pct1 = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n.toFixed(1)}%`);
/** A land share as people read it: whole percent from 1% up, three decimals below, so a 0.003% sliver never reads as 0. */
export const share = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n >= 1 ? `${Math.round(n)}%` : `${n.toFixed(3)}%`);
export const dateLabel = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

// Each answer is stored against the request that produced it; a late reply never overwrites a newer one, and the
// previous answer stays on screen while the next is in flight. An empty URL fetches nothing. `cache: 'default'` lets
// the browser reuse an immutable per-run response.
export function useJson<T>(url: string, revision = 0, cache: RequestCache = 'no-store') {
  const key = `${revision} ${url}`;
  const [answer, setAnswer] = useState<{ key: string; data: T | null; error: string }>({ key: '', data: null, error: '' });
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    void fetch(url, { signal: controller.signal, cache })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error ?? (response.status === 401 ? 'Your session has expired. Sign in again.' : 'The request failed. Retry.'));
        return body as T;
      })
      .then(data => { if (!controller.signal.aborted) setAnswer({ key, data, error: '' }); })
      .catch(error => { if (!controller.signal.aborted && error.name !== 'AbortError') setAnswer({ key, data: null, error: error instanceof Error ? error.message : 'The request failed. Retry.' }); });
    return () => controller.abort();
  }, [url, revision, key, cache]);
  if (!url) return { data: null as T | null, loading: false, error: '' };
  return answer.key === key ? { data: answer.data, loading: false, error: answer.error } : { data: answer.error ? null : answer.data, loading: true, error: '' };
}
