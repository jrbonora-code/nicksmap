'use client';
// The tract list. AG Grid with its own theme at the page's type scale: 16px cells, 64px rows, 38px header. The default
// columns are the tract, its class or tier, and two numbers; Table view adds the incentive and source columns. Focus
// selects: clicking a row or moving with the arrow keys opens it in the drawer, Escape closes it.
import { useEffect, useMemo, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type GridApi } from 'ag-grid-community';
import type { OzEb5TractSummary } from '../../lib/research/oz-eb5';
import type { Oz2027TractRow } from '../../lib/research/oz2027';
import { ClassLabel, STATE_ABBR, TierLabel, int, pct1, share } from './oz-eb5-parts';

ModuleRegistry.registerModules([AllCommunityModule]);
/** The list grid's theme at the page type scale; the property list uses it too. */
export const LIST_THEME = themeQuartz.withParams({
  accentColor: '#284f60', backgroundColor: '#ffffff', foregroundColor: '#111f27', borderColor: '#d5dde1', fontFamily: '"Manrope", "Segoe UI", Arial, sans-serif',
  fontSize: 16, headerFontSize: 14, headerFontWeight: 650, headerTextColor: '#2c3f4a', headerBackgroundColor: '#f4f6f6', rowHeight: 64, headerHeight: 38,
  rowBorder: { color: '#e6ebed' }, wrapperBorder: false, wrapperBorderRadius: 0, cellHorizontalPadding: 14, rowHoverColor: '#f1f4f5', selectedRowBackgroundColor: '#e6eef1',
});
export type ListRow = OzEb5TractSummary | Oz2027TractRow;
const is2018 = (row: ListRow): row is OzEb5TractSummary => 'geoid2010' in row;
const geoidOf = (row: ListRow) => (is2018(row) ? row.geoid2010 : row.geoid2020);

function TractCell({ data }: { data?: ListRow }) {
  if (!data) return null;
  const county = is2018(data) ? data.countyName : data.county;
  return <div className="oz-t2"><span className="a">{county.replace(/ (County|Parish|Borough|Census Area|Municipio|Municipality|city and borough)$/i, '')}, {STATE_ABBR[data.state] ?? data.state}</span><code className="b">{geoidOf(data)}</code></div>;
}
const dash = <span className="oz-dash">—</span>;
const yes = (v: boolean) => (v ? 'Yes' : 'No');
const flag = (value: string | null, landPct: number | null) => value === 'yes' ? 'Yes' : value === 'partial' ? (landPct !== null && landPct >= 1 ? share(landPct) : 'Sliver') : value === 'no' ? 'No' : value === null ? '—' : value === 'metro_zcta_not_evaluated' ? 'Not evaluated' : 'Unknown';

export function OzEb5List({ mode, rows, table, compact = false, selected, hovered, onSelect, onHover }: {
  mode: '2018' | '2027'; rows: ListRow[]; table: boolean; compact?: boolean; selected: string; hovered: string;
  onSelect: (geoid: string) => void; onHover: (geoid: string) => void;
}) {
  const api = useRef<GridApi<ListRow> | null>(null);
  const columns = useMemo<ColDef<ListRow>[]>(() => {
    const tract: ColDef<ListRow> = { headerName: 'Tract', colId: 'tract', flex: 1.3, minWidth: 150, cellRenderer: TractCell, sortable: false };
    if (mode === '2018') {
      const base: ColDef<ListRow>[] = [
        tract,
        { headerName: 'EB-5 class', colId: 'class', flex: 1.4, minWidth: 170, sortable: false, cellRenderer: ({ data }: { data?: ListRow }) => (data && is2018(data) ? <ClassLabel cls={data.eb5RuralClass} /> : null) },
        { headerName: 'Poverty', colId: 'poverty', width: 100, type: 'rightAligned', sortable: false, cellRenderer: ({ data }: { data?: ListRow }) => (data && is2018(data) && data.acs2024PovertyRate !== null ? pct1(data.acs2024PovertyRate) : dash) },
        { headerName: 'Properties', colId: 'properties', width: 116, type: 'rightAligned', sortable: false, cellRenderer: ({ data }: { data?: ListRow }) => (data && is2018(data) && data.propertyCount ? int(data.propertyCount) : dash) },
      ];
      if (compact) return base.slice(0, 2);
      if (!table) return base;
      return [...base,
        { headerName: 'QCT', colId: 'qct', width: 110, sortable: false, valueGetter: p => (p.data && is2018(p.data) ? flag(p.data.lihtcQct2026, p.data.lihtcQct2026LandPct) : '') },
        { headerName: 'DDA', colId: 'dda', width: 130, sortable: false, valueGetter: p => (p.data && is2018(p.data) ? flag(p.data.lihtcDda2026, null) : '') },
        { headerName: 'NMTC', colId: 'nmtc', width: 110, sortable: false, valueGetter: p => (p.data && is2018(p.data) ? flag(p.data.nmtcLicEligible, p.data.nmtcLicLandPct) : '') },
        { headerName: '2027', colId: 'oz2027', width: 130, sortable: false, valueGetter: p => {
          const d = p.data;
          if (!d || !is2018(d)) return '';
          if (d.oz2027) return d.oz2027.badge === 'fully_eligible' ? 'Yes' : d.oz2027.badge === 'partly_eligible' ? share(d.oz2027.eligibleLandPct) : d.oz2027.badge === 'sliver_only' ? 'Sliver' : 'No';
          return d.oz2027Status === 'fully_eligible' ? 'Yes' : d.oz2027Status === 'partially_eligible' ? (d.oz2027EligibleLandPct !== null && d.oz2027EligibleLandPct >= 1 ? share(d.oz2027EligibleLandPct) : 'Sliver') : d.oz2027Status === 'not_eligible' ? 'No' : '—';
        } },
        { headerName: 'CBSA', colId: 'cbsa', flex: 1.2, minWidth: 200, sortable: false, valueGetter: p => (p.data && is2018(p.data) ? p.data.cbsaTitle || 'None' : '') },
        { headerName: 'Poverty 2015', colId: 'poverty2015', width: 140, type: 'rightAligned', sortable: false, valueGetter: p => (p.data && is2018(p.data) ? pct1(p.data.acs2015PovertyRate) : '') },
      ];
    }
    const base: ColDef<ListRow>[] = [
      tract,
      { headerName: 'Status', colId: 'status', flex: 1.4, minWidth: 150, wrapText: true, cellClass: 'oz-wrap', sortable: false, cellRenderer: ({ data }: { data?: ListRow }) => (data && !is2018(data) ? <TierLabel tier={data.headlineStatus} /> : null) },
      { headerName: 'OZ-rural', colId: 'rural', width: 96, sortable: false, valueGetter: p => (p.data && !is2018(p.data) ? yes(p.data.ruralStatus === 1) : '') },
      { headerName: 'EB-5 screen', colId: 'eb5', flex: 1.2, minWidth: 130, sortable: false, wrapText: true, cellClass: 'oz-wrap', cellRenderer: ({ data }: { data?: ListRow }) => (data && !is2018(data) && data.eb5Classes.length ? <ClassLabel cls={data.eb5Classes.includes('rural_clear') ? 'rural_clear' : data.eb5Classes[0]} /> : dash) },
      { headerName: '2018 overlap', colId: 'overlap', width: 104, headerClass: 'oz-wrap-head', wrapHeaderText: true, type: 'rightAligned', sortable: false, valueGetter: p => (p.data && !is2018(p.data) ? (p.data.overlap2018LandPct >= 1 ? share(p.data.overlap2018LandPct) : 'None') : '') },
    ];
    if (compact) return base.slice(0, 2);
    if (!table) return base;
    return [...base,
      { headerName: 'Poverty', colId: 'poverty', width: 112, type: 'rightAligned', sortable: false, valueGetter: p => (p.data && !is2018(p.data) ? pct1(p.data.povertyRate) : '') },
      { headerName: 'Income ratio', colId: 'mfi', width: 140, type: 'rightAligned', sortable: false, valueGetter: p => (p.data && !is2018(p.data) ? pct1(p.data.mfiRatio) : '') },
      { headerName: 'Lists', colId: 'signals', width: 100, type: 'rightAligned', sortable: false, valueGetter: p => (p.data && !is2018(p.data) ? p.data.signalCount : '') },
      { headerName: 'April list', colId: 'april', width: 120, sortable: false, valueGetter: p => (p.data && !is2018(p.data) ? yes(p.data.inAprilAppendix) : '') },
      { headerName: 'CBSA', colId: 'cbsa', flex: 1.2, minWidth: 200, sortable: false, valueGetter: p => (p.data && !is2018(p.data) ? p.data.cbsa || 'None' : '') },
    ];
  }, [mode, table, compact]);

  // Selection scrolls its row into view; the class marks it for the stylesheet.
  useEffect(() => {
    const grid = api.current;
    if (!grid || !selected) return;
    const node = grid.getRowNode(selected);
    if (node) grid.ensureNodeVisible(node, 'middle');
    grid.redrawRows();
  }, [selected]);
  useEffect(() => { api.current?.redrawRows(); }, [hovered]);

  return <div className="oz-grid" onMouseLeave={() => onHover('')}>
    <AgGridReact<ListRow>
      theme={LIST_THEME} rowData={rows} columnDefs={columns} getRowId={p => geoidOf(p.data)} animateRows={false} suppressCellFocus={false} suppressMovableColumns
      rowClassRules={{ 'oz-row-sel': p => !!p.data && geoidOf(p.data) === selected, 'oz-row-hover': p => !!p.data && geoidOf(p.data) === hovered && geoidOf(p.data) !== selected }}
      onGridReady={e => { api.current = e.api; }}
      onRowClicked={e => { if (e.data) onSelect(geoidOf(e.data)); }}
      onCellMouseOver={e => { if (e.data) onHover(geoidOf(e.data)); }}
      onCellFocused={e => {
        if (e.rowIndex === null || e.rowIndex === undefined || !api.current) return;
        const node = api.current.getDisplayedRowAtIndex(e.rowIndex);
        if (node?.data && geoidOf(node.data) !== selected) onSelect(geoidOf(node.data));
      }}
      onCellKeyDown={e => { const key = (e.event as KeyboardEvent | undefined)?.key; if (key === 'Escape') onSelect(''); else if (key === 'Enter' && e.data) onSelect(geoidOf(e.data)); }}
      overlayNoRowsTemplate={'<span class="oz-empty">No tract matches these filters</span>'}
    />
  </div>;
}
