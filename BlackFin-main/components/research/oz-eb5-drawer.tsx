'use client';
// The detail drawer: 440px, pushing the map from 1280px and overlaying below that, a full sheet on a phone. Field and
// value rows only; long source text sits in a collapsed Basis block. Every value comes from the run; a missing value
// reads as a dash, never as zero.
import { ArrowLeft, ChevronLeft, ChevronRight, Crosshair, ExternalLink, Link2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { OZ_EB5_ASSET_SOURCE_LABELS, type OzEb5Asset, type OzEb5TractRow } from '../../lib/research/oz-eb5';
import type { Oz2027Run, Oz2027Signal, Oz2027Source, Oz2027State, Oz2027TractRow, Oz2027Tier, Notice202640Label, Oz2027Link2018 } from '../../lib/research/oz2027';
import { CLASS_LABELS, ClassGlyph, ClassLabel, Fv, TIER_LABELS, TierLabel, dateLabel, int, pct1, share, useJson } from './oz-eb5-parts';
import { progressOf } from './oz2027-states';

/** The drawer's top bar, shared with the property page: back (phone), previous, next, position, copy link, close. */
export type DrawerChrome = { position: number; total: number; onPrev: () => void; onNext: () => void; onClose: () => void; mobile: boolean; noun?: string };
type Chrome = DrawerChrome;
export function DrawerTop({ position, total, onPrev, onNext, onClose, mobile, noun = 'tract' }: Chrome) {
  const [copied, setCopied] = useState(false);
  return <div className="oz-dr-top">
    {mobile && <button type="button" className="oz-icon" aria-label="Back to the list" onClick={onClose}><ArrowLeft size={20} /></button>}
    <button type="button" className="oz-icon" aria-label={`Previous ${noun}`} disabled={position <= 1} onClick={onPrev}><ChevronLeft size={20} /></button>
    <button type="button" className="oz-icon" aria-label={`Next ${noun}`} disabled={position >= total} onClick={onNext}><ChevronRight size={20} /></button>
    {total > 0 && <span className="pos">{position > 0 ? `${int(position)} of ${int(total)}` : `${int(total)} listed`}</span>}
    <span className="sp" />
    <button type="button" className="oz-icon" aria-label={copied ? 'Link copied' : 'Copy link'} title={copied ? 'Link copied' : 'Copy link'} onClick={() => { void navigator.clipboard?.writeText(window.location.href).then(() => setCopied(true)); }}><Link2 size={19} /></button>
    {!mobile && <button type="button" className="oz-icon" aria-label="Close" onClick={onClose}><X size={20} /></button>}
  </div>;
}
export const Ext = ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href} target="_blank" rel="noreferrer">{children}<ExternalLink size={14} aria-hidden="true" className="oz-ext" /></a>;
function NoticeRows({ notice }: { notice: Notice202640Label }) {
  return <><Fv label="2018 zone">{notice.ends}</Fv><Fv label="New purchases"><span>{notice.rule.replace(/^New purchases a/, 'A')}</span> <Ext href={notice.url}>{notice.citation}</Ext></Fv></>;
}
const sliverText = (pct: number | null) => (pct === null || pct === 0 ? 'Sliver only under 1%' : `Sliver only ${share(pct)}`);
function flagText(value: string | null, pct: number | null, basis: 'share' | 'none' = 'share') {
  if (value === null) return 'Not carried';
  if (value === 'yes') return 'Yes';
  if (value === 'no') return 'No';
  if (value === 'partial') return pct !== null && pct >= 1 ? `Partly, ${share(pct)} of land` : sliverText(pct);
  if (value === 'metro_zcta_not_evaluated') return 'Not evaluated (metro)';
  return basis === 'none' ? value : 'Unknown';
}
const droppedParts = (text: string) => [...text.matchAll(/(\d{11}) \(([\d.]+)%/g)].map(m => ({ geoid: m[1], pct: Number(m[2]) }));

// ---------- 2018 tract ----------
type TractResponse = { row: OzEb5TractRow | null } | null;
type AssetsResponse = { rows: OzEb5Asset[] } | null;
export function Tract2018Drawer({ geoid, chrome, revision, onTestPoint, onOpenProperties }: { geoid: string; chrome: Chrome; revision: number; onTestPoint: () => void; onOpenProperties: () => void }) {
  const detail = useJson<TractResponse>(`/api/research/oz-eb5/tract?geoid=${geoid}`, revision);
  const assets = useJson<AssetsResponse>(`/api/research/oz-eb5/assets?geoid=${geoid}&all=1`, revision);
  const [allProps, setAllProps] = useState(false);
  const row = detail.data?.row ?? null;
  const properties = useMemo(() => {
    const groups = new Map<string, OzEb5Asset[]>();
    for (const a of assets.data?.rows ?? []) groups.set(a.propertyKey, [...(groups.get(a.propertyKey) ?? []), a]);
    return [...groups.values()].map(records => {
      const units = records.map(r => r.totalUnits).filter((u): u is number => u !== null && u > 0);
      const name = records.map(r => r.propertyName).find(n => n.trim()) ?? records[0].address;
      return { key: records[0].propertyKey, name, records, units: units.length ? (Math.min(...units) === Math.max(...units) ? `${int(Math.max(...units))} units` : `${int(Math.min(...units))}–${int(Math.max(...units))} units`) : 'Units not reported' };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [assets.data]);
  return <aside className="oz-drawer" aria-label="Tract detail">
    <DrawerTop {...chrome} />
    <div className="oz-dr-body">
      {detail.loading && !row && <p className="oz-dr-note" role="status">Loading</p>}
      {detail.error && <p className="oz-dr-note" role="alert">{detail.error}</p>}
      {row && <>
        <h2 className="oz-dr-title">{row.countyName}, {row.state}</h2>
        <div className="oz-dr-id"><code>{row.geoid2010}</code><ClassLabel cls={row.eb5RuralClass} /></div>
        <section className="oz-dr-sec"><h3>Rural test</h3><dl className="oz-fv">
          <Fv label="Metro area">{row.cbsaType === 'metropolitan' ? row.cbsaTitle : 'None (OMB 2023)'}</Fv>
          {row.cbsaType === 'micropolitan' && <Fv label="Micro area">{row.cbsaTitle}</Fv>}
          <Fv label="Place 20,000+">{row.place20kNames || 'None (IIUSA)'}</Fv>
          {row.townBasis && <Fv label="New England town">{row.townBasis}</Fv>}
          <Fv label="Sliver set aside">{droppedParts(row.droppedSuccessors).length ? droppedParts(row.droppedSuccessors).map(p => <span key={p.geoid} className="oz-pair"><code>{p.geoid}</code> {share(p.pct)}</span>) : 'None'}</Fv>
        </dl></section>
        <section className="oz-dr-sec"><h3>Incentives</h3><dl className="oz-fv">
          <Fv label="QCT 2026">{flagText(row.lihtcQct2026, row.lihtcQct2026LandPct)}</Fv>
          <Fv label="DDA 2026">{flagText(row.lihtcDda2026, null)}</Fv>
          <Fv label="NMTC">{flagText(row.nmtcLicEligible, row.nmtcLicLandPct)}</Fv>
          <Fv label="2027 round">{row.oz2027
            ? row.oz2027.badge === 'fully_eligible' ? (row.oz2027.headline && row.oz2027.headline !== 'eligible' ? TIER_LABELS[row.oz2027.headline] : 'Eligible')
              : row.oz2027.badge === 'partly_eligible' ? `${row.oz2027.headline && row.oz2027.headline !== 'eligible' ? TIER_LABELS[row.oz2027.headline] : 'Eligible'} on ${share(row.oz2027.eligibleLandPct)} of land`
                : row.oz2027.badge === 'sliver_only' ? sliverText(row.oz2027.eligibleLandPct) : 'Not eligible'
            : row.oz2027Status === 'partially_eligible' && (row.oz2027EligibleLandPct ?? 0) < 1 ? sliverText(row.oz2027EligibleLandPct) : row.oz2027Status === 'fully_eligible' ? 'Eligible' : row.oz2027Status === 'partially_eligible' ? `Partly, ${share(row.oz2027EligibleLandPct)} of land` : row.oz2027Status === 'not_eligible' ? 'Not eligible' : 'Not carried'}</Fv>
          {row.oz2027 && <Fv label="OZ-rural and EB-5 rural">{row.oz2027.ozRuralAndEb5Rural ? 'Yes' : 'No'}</Fv>}
          {row.oz2027 && <NoticeRows notice={row.oz2027.notice} />}
        </dl></section>
        <section className="oz-dr-sec"><h3>Demographics</h3><dl className="oz-fv">
          <Fv label="Poverty 2015">{row.acs2015PovertyRate === null ? null : pct1(row.acs2015PovertyRate)}</Fv>
          <Fv label="Poverty 2024">{row.acs2024PovertyRate !== null ? pct1(row.acs2024PovertyRate) : row.acs2024Coverage === 'partial' ? 'Not carried (split tract)' : row.acs2024Coverage === null ? 'Not carried' : 'Unknown'}</Fv>
          <Fv label="Income 2015">{row.acs2015MfiRatioPct === null ? null : `${row.acs2015MfiRatioPct.toFixed(1)}% of benchmark`}</Fv>
          <Fv label="Income 2024">{row.acs2024MedianFamilyIncomeUsd === null ? null : row.acs2024MedianFamilyIncomeUsd === 250001 ? '$250,000 or more' : `$${int(row.acs2024MedianFamilyIncomeUsd)}`}</Fv>
          <Fv label="Population 2024">{row.acs2024Population === null ? null : int(row.acs2024Population)}</Fv>
        </dl></section>
        <section className="oz-dr-sec"><h3>Properties <span className="n">{int(properties.length)}</span>{properties.length > 4 && <button type="button" className="r" onClick={() => setAllProps(v => !v)}>{allProps ? 'Show fewer' : 'Show all'}</button>}</h3>
          {properties.length === 0 && !assets.loading && <p className="oz-dr-note">None recorded</p>}
          {(allProps ? properties : properties.slice(0, 4)).map(p => <details key={p.key} className="oz-prop"><summary><span>{p.name}</span><span className="u">{p.units}</span></summary>
            <dl className="oz-fv">{p.records.map(r => <Fv key={`${r.source}:${r.sourceObjectId}`} label={OZ_EB5_ASSET_SOURCE_LABELS[r.source]}>{r.totalUnits === null ? 'Units not reported' : `${int(r.totalUnits)} units`}{r.expirationYear ? `, ends ${r.expirationYear}` : ''}</Fv>)}</dl>
          </details>)}
        </section>
        <details className="oz-basis"><summary>Basis</summary><dl className="oz-fv">
          <Fv label="Class">{row.classReason}</Fv><Fv label="2010 to 2020">{row.bridgeType}</Fv><Fv label="2020 successors">{row.tracts2020}</Fv>
          <Fv label="Metro basis">{row.msaBasis}</Fv><Fv label="Notes">{row.notes}</Fv><Fv label="2027 (April list)">{row.oz2027Basis}</Fv>
          <Fv label="QCT 2026">{row.lihtcQct2026Basis}</Fv><Fv label="DDA 2026">{row.lihtcDda2026Basis}</Fv><Fv label="NMTC">{row.nmtcBasis}</Fv>
          <Fv label="ACS 2011-2015">{row.acs2015Basis}</Fv><Fv label="ACS 2020-2024">{row.acs2024Basis}</Fv>
        </dl></details>
      </>}
    </div>
    <div className="oz-dr-foot">
      <button type="button" className="oz-btn primary" onClick={onTestPoint}><Crosshair size={18} aria-hidden="true" />Test a point</button>
      <button type="button" className="oz-btn" disabled={!properties.length} onClick={onOpenProperties}>Open properties</button>
    </div>
  </aside>;
}

// ---------- 2027 tract ----------
type Detail2027 = { run: Pick<Oz2027Run, 'id'>; geoid: string; tract: Oz2027TractRow | null; onEligibleList: boolean; signals: Oz2027Signal[]; links2018: Oz2027Link2018[]; withheldStateSources: Oz2027Source[]; state: Partial<Oz2027State> & { state: string } | null } | null;
const ROUTES: Record<string, string> = { poverty: 'Poverty 20%+', median_income: 'Income 70% or less', poverty_and_median_income: 'Poverty and income', median_income_upper_bound: 'Income (upper bound)', temporary_displacement: 'Temporary displacement', other: 'Other' };
const CONFIDENCE: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low', unverified: 'Unverified' };
export function Tract2027Drawer({ geoid, chrome, revision, onTestPoint, onOpen2018 }: { geoid: string; chrome: Chrome; revision: number; onTestPoint: () => void; onOpen2018: (geoid2010: string) => void }) {
  const detail = useJson<Detail2027>(`/api/research/oz2027/tract?geoid=${geoid}`, revision);
  const d = detail.data, t = d?.tract ?? null;
  const head = d?.signals.find(s => s.sourceId === t?.headlineSourceId) ?? null;
  const link = d?.links2018.find(l => l.shareOf2020Pct >= 1) ?? null;
  return <aside className="oz-drawer" aria-label="2027 tract detail">
    <DrawerTop {...chrome} />
    <div className="oz-dr-body">
      {detail.loading && !d && <p className="oz-dr-note" role="status">Loading</p>}
      {detail.error && <p className="oz-dr-note" role="alert">{detail.error}</p>}
      {d && <>
        <h2 className="oz-dr-title">{t ? `${t.county}, ${t.state}` : `Tract ${d.geoid}`}</h2>
        <div className="oz-dr-id"><code>{d.geoid}</code>{t ? <TierLabel tier={t.headlineStatus} /> : <span>Not on Treasury&apos;s list</span>}</div>
        <section className="oz-dr-sec"><h3>2027 round</h3><dl className="oz-fv">
          <Fv label="Status">{t ? TIER_LABELS[t.headlineStatus] : 'Not eligible'}</Fv>
          <Fv label="Confidence">{t?.headlineConfidence ? CONFIDENCE[t.headlineConfidence] : null}</Fv>
          <Fv label="Source">{head?.source ? <Ext href={head.sourceUrl}>{head.source.publisher}</Ext> : t ? "Treasury eligible list" : null}</Fv>
          <Fv label="OZ-rural">{t ? (t.ruralStatus === 1 ? 'Yes' : 'No') : null}</Fv>
          <Fv label="Eligible by">{t ? ROUTES[t.eligibilityRoute] ?? t.eligibilityRoute : null}</Fv>
          <Fv label="April list">{t ? (t.inAprilAppendix ? 'Yes' : 'No, added 23 Sep 2026') : null}</Fv>
        </dl></section>
        {d.signals.length > 0 && <section className="oz-dr-sec"><h3>Lists <span className="n">{d.signals.length}</span></h3><dl className="oz-fv">
          {d.signals.map(s => <Fv key={s.sourceId} label={TIER_LABELS[s.status as Oz2027Tier]}>
            <Ext href={s.sourceUrl}>{s.source?.publisher ?? s.sourceId}</Ext>
            <span className="s">{[dateLabel(s.sourceDate), CONFIDENCE[s.confidence], s.jurisdiction].filter(v => v && v !== '—').join(', ')}</span>
            {s.notes && <span className="s">{s.notes}</span>}
          </Fv>)}
        </dl></section>}
        {d.withheldStateSources.length > 0 && <section className="oz-dr-sec"><h3>State claims</h3><dl className="oz-fv">
          {d.withheldStateSources.map(s => <Fv key={s.id} label={TIER_LABELS[s.tier]}><span>{s.publisher}</span><span className="s">Tract list not shipped (D06); confidence {CONFIDENCE[s.confidence]?.toLowerCase()}</span></Fv>)}
        </dl></section>}
        <section className="oz-dr-sec"><h3>EB-5 and 2018</h3><dl className="oz-fv">
          <Fv label="EB-5 screen">{t && t.eb5Classes.length ? <ClassLabel cls={t.eb5Classes.includes('rural_clear') ? 'rural_clear' : t.eb5Classes[0]} /> : 'Not screened'}</Fv>
          <Fv label="OZ-rural and EB-5 rural">{t ? (t.eb5RuralBoth ? 'Yes' : 'No') : null}</Fv>
          <Fv label="2018 overlap">{t ? (t.overlap2018LandPct >= 1 ? share(t.overlap2018LandPct) : t.overlap2018LandPct > 0 ? `Sliver only ${share(t.overlap2018LandPct)}` : 'None') : null}</Fv>
          {d.links2018.map(l => <Fv key={l.geoid2010} label={`2018 tract`}><button type="button" className="oz-link" onClick={() => onOpen2018(l.geoid2010)}><code>{l.geoid2010}</code></button> <span className="s">{share(l.shareOf2020Pct)} of this tract{l.eb5RuralClass ? `, ${CLASS_LABELS[l.eb5RuralClass]}` : ''}</span></Fv>)}
          {link && <NoticeRows notice={link.notice} />}
        </dl></section>
        {t && <section className="oz-dr-sec"><h3>Demographics</h3><dl className="oz-fv">
          <Fv label="Poverty 2024">{pct1(t.povertyRate)}</Fv>
          <Fv label="Income ratio">{t.mfiRatio === null ? (t.mfiUbRatio === null ? null : `${t.mfiUbRatio.toFixed(1)}% (upper bound)`) : `${t.mfiRatio.toFixed(1)}% of area`}</Fv>
          <Fv label="CBSA">{t.cbsa || 'None'}</Fv>
        </dl></section>}
      </>}
    </div>
    <div className="oz-dr-foot">
      <button type="button" className="oz-btn primary" onClick={onTestPoint}><Crosshair size={18} aria-hidden="true" />Test a point</button>
      {link && <button type="button" className="oz-btn" onClick={() => onOpen2018(link.geoid2010)}>Open 2018 tract</button>}
    </div>
  </aside>;
}

// ---------- state ----------
const STATUS_LABELS: Record<string, string> = { ...TIER_LABELS, extension: 'No list yet', unknown: 'No list yet' };
export function StateDrawer({ state, sources, chrome, onShowTracts }: { state: Oz2027State; sources: Oz2027Source[]; chrome: Chrome; onShowTracts: () => void }) {
  const own = sources.filter(s => s.state === state.state);
  return <aside className="oz-drawer" aria-label="State detail">
    <DrawerTop {...chrome} />
    <div className="oz-dr-body">
      <h2 className="oz-dr-title">{state.state}</h2>
      <div className="oz-dr-id"><span>{STATUS_LABELS[state.status] ?? state.status}</span></div>
      <section className="oz-dr-sec"><h3>Progress</h3><dl className="oz-fv">
        <Fv label="State status">{STATUS_LABELS[state.status] ?? state.status}</Fv>
        <Fv label="Furthest list">{progressOf(state) ? TIER_LABELS[progressOf(state)!] : 'None yet'}</Fv>
        <Fv label="Nominated">{state.nominatedDate ? dateLabel(state.nominatedDate) : null}</Fv>
        <Fv label="Certified">{state.certifiedDate ? dateLabel(state.certifiedDate) : null}</Fv>
        <Fv label="Cap">{state.cap === null ? null : int(state.cap)}</Fv>
        <Fv label="Nominated tracts">{state.nominatedCount === null ? null : int(state.nominatedCount)}</Fv>
        <Fv label="Eligible">{int(state.eligibleCount)}</Fv>
        <Fv label="OZ-rural eligible">{int(state.eligibleRuralCount)}</Fv>
        <Fv label="Tracts on a list">{int(state.tractSignalCount)}</Fv>
        <Fv label="Confidence">{CONFIDENCE[state.confidence]}</Fv>
        <Fv label="Source"><Ext href={state.sourceUrl}>{new URL(state.sourceUrl).hostname.replace(/^www\./, '')}</Ext></Fv>
      </dl></section>
      {own.length > 0 && <section className="oz-dr-sec"><h3>Lists <span className="n">{own.length}</span></h3><dl className="oz-fv">
        {own.map(s => <Fv key={s.id} label={TIER_LABELS[s.tier]}>
          {s.shipped ? <Ext href={s.documentUrl ?? s.url ?? state.sourceUrl}>{s.publisher}</Ext> : <span>{s.publisher}</span>}
          <span className="s">{[dateLabel(s.date), s.shipped ? `${int(s.signals ?? 0)} tracts` : 'Tract list not shipped (D06)'].join(', ')}</span>
        </Fv>)}
      </dl></section>}
      <details className="oz-basis" open><summary>Notes</summary><p className="oz-dr-note">{state.notes}</p></details>
    </div>
    <div className="oz-dr-foot"><button type="button" className="oz-btn primary" onClick={onShowTracts}>Show tracts</button></div>
  </aside>;
}
export { ClassGlyph };
