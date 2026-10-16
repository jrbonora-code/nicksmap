'use client';
// The property list: the OZ page's grid and theme. Six default columns; Table view adds the rest. Clicking a row or
// moving to it with the arrow keys opens it in the drawer; Escape closes it. The server sorts (the Sort menu).
import { useEffect, useMemo, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, type ColDef, type GridApi } from 'ag-grid-community';
import type { ScreenRow } from '../../lib/research/types';
import { BALANCE_SOURCE_LABELS } from '../../lib/research/balance-estimate';
import { LIST_THEME } from './oz-eb5-list';
import { dateLabel, int } from './oz-eb5-parts';
import { usdShort } from './format';

ModuleRegistry.registerModules([AllCommunityModule]);
const dash = <span className="oz-dash">—</span>;
const lenderOf = (r: ScreenRow) => r.scenarioDebt?.lender ?? r.mortgages.find(d => d.lender)?.lender ?? null;
/** "123 Main St, Tampa, FL 33602" as street over place. */
export function splitAddress(address: string) {
  const i = address.indexOf(',');
  return i < 0 ? { street: address, place: '' } : { street: address.slice(0, i), place: address.slice(i + 1).trim() };
}
export function balanceText(r: ScreenRow) {
  const b = r.balance;
  if (!b) return null;
  return b.lowCents !== undefined && b.highCents !== undefined ? `${usdShort(b.lowCents)}–${usdShort(b.highCents)}` : usdShort(b.cents);
}
function PropertyCell({ data }: { data?: ScreenRow }) {
  if (!data) return null;
  const { street, place } = splitAddress(data.address);
  return <div className="oz-t2"><span className="a" title={data.address}>{street}</span><span className="b">{place}</span></div>;
}
function BalanceCell({ data }: { data?: ScreenRow }) {
  if (!data?.balance) return dash;
  return <div className="oz-t2 rs-num"><span className="a">{balanceText(data)}</span><span className="b">{BALANCE_SOURCE_LABELS[data.balance.source]}</span></div>;
}

export function ResearchList({ rows, table, compact = false, asOf, selected, onSelect }: {
  rows: ScreenRow[]; table: boolean; compact?: boolean; asOf: string; selected: string; onSelect: (id: string) => void;
}) {
  const api = useRef<GridApi<ScreenRow> | null>(null);
  const columns = useMemo<ColDef<ScreenRow>[]>(() => {
    const base: ColDef<ScreenRow>[] = [
      { headerName: 'Property', colId: 'property', flex: 1.6, minWidth: 160, cellRenderer: PropertyCell },
      { headerName: 'County', colId: 'county', width: 122, valueGetter: p => p.data?.countyName ?? '' },
      { headerName: 'Units', colId: 'units', width: 74, type: 'rightAligned', valueGetter: p => p.data?.providerUnits ?? null, valueFormatter: p => int(p.value) },
      { headerName: 'Balance', colId: 'balance', width: 140, cellRenderer: BalanceCell },
      { headerName: 'Lender', colId: 'lender', flex: 1, minWidth: 110, valueGetter: p => (p.data ? lenderOf(p.data) ?? '—' : ''), tooltipValueGetter: p => p.value, cellClass: 'rs-ellipsis' },
      { headerName: 'Maturity', colId: 'maturity', width: 120, cellRenderer: ({ data }: { data?: ScreenRow }) => {
        if (!data?.earliestMaturity) return dash;
        return <div className="oz-t2"><span className="a">{dateLabel(data.earliestMaturity)}</span>{data.earliestMaturity < asOf && <span className="b">Passed</span>}</div>;
      } },
    ];
    if (compact) return [base[0], base[3]];
    if (!table) return base;
    return [...base,
      { headerName: 'Owner', colId: 'owner', flex: 1, minWidth: 180, valueGetter: p => p.data?.owner ?? '—', tooltipValueGetter: p => p.value, cellClass: 'rs-ellipsis' },
      { headerName: 'Licensed units', colId: 'licensed', width: 148, type: 'rightAligned', valueGetter: p => p.data?.licensedUnits.join(' / ') || '—' },
      { headerName: 'Address link', colId: 'link', width: 138, valueGetter: p => (p.data ? (p.data.strictAddress ? 'Consistent' : 'Review') : '') },
      { headerName: 'Recorded amount', colId: 'recorded', width: 168, type: 'rightAligned', valueGetter: p => p.data?.scenarioDebt?.amountCents ?? null, valueFormatter: p => (p.value === null ? '—' : usdShort(p.value)) },
      { headerName: 'Reported rate', colId: 'rate', width: 144, type: 'rightAligned', valueGetter: p => (Number(p.data?.scenarioDebt?.reportedRate) > 0 ? p.data!.scenarioDebt!.reportedRate : '—') },
      { headerName: 'Required NOI', colId: 'noi', width: 150, type: 'rightAligned', valueGetter: p => p.data?.scenarioResult?.requiredNoiCents ?? null, valueFormatter: p => (p.value === null ? '—' : usdShort(p.value)) },
      { headerName: 'Required value', colId: 'value', width: 158, type: 'rightAligned', valueGetter: p => p.data?.scenarioResult?.requiredValueCents ?? null, valueFormatter: p => (p.value === null ? '—' : usdShort(p.value)) },
      { headerName: 'Provider equity', colId: 'equity', width: 158, type: 'rightAligned', valueGetter: p => p.data?.providerEstimate?.equityCents ?? null, valueFormatter: p => (p.value === null ? '—' : usdShort(p.value)) },
      { headerName: 'OZ 2027', colId: 'oz', width: 132, valueGetter: p => (p.data ? (p.data.oz === 'eligible' ? 'Eligible' : p.data.oz === 'not_in_list' ? 'Not eligible' : 'Unresolved') : '') },
      { headerName: 'Parcel ID', colId: 'apn', width: 176, valueGetter: p => p.data?.apn ?? '—' },
    ];
  }, [table, compact, asOf]);

  useEffect(() => {
    const grid = api.current;
    if (!grid || grid.isDestroyed()) return;
    if (selected) { const node = grid.getRowNode(selected); if (node) grid.ensureNodeVisible(node, 'middle'); }
    grid.redrawRows();
  }, [selected]);

  return <div className="oz-grid">
    <AgGridReact<ScreenRow>
      theme={LIST_THEME} rowData={rows} columnDefs={columns} getRowId={p => p.data.id} animateRows={false} suppressMovableColumns
      defaultColDef={{ sortable: false, resizable: true }} tooltipShowDelay={400}
      rowClassRules={{ 'oz-row-sel': p => !!p.data && p.data.id === selected }}
      onGridReady={e => { api.current = e.api; }}
      onRowClicked={e => { if (e.data) onSelect(e.data.id); }}
      onCellFocused={e => {
        if (e.rowIndex === null || e.rowIndex === undefined || !api.current) return;
        const node = api.current.getDisplayedRowAtIndex(e.rowIndex);
        if (node?.data && node.data.id !== selected) onSelect(node.data.id);
      }}
      onCellKeyDown={e => { const key = (e.event as KeyboardEvent | undefined)?.key; if (key === 'Escape') onSelect(''); else if (key === 'Enter' && e.data) onSelect(e.data.id); }}
      overlayNoRowsTemplate={'<span class="oz-empty">No property matches these filters</span>'}
    />
  </div>;
}
