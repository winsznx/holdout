'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';

export interface SortColumn<Row> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  mono?: boolean;
  sortValue?: (row: Row) => number | string;
  cell: (row: Row) => ReactNode;
}

type Direction = 'asc' | 'desc';

export function compareValues(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

export function sortRows<Row>(rows: Row[], column: SortColumn<Row> | undefined, direction: Direction): Row[] {
  const get = column?.sortValue;
  if (!get) return rows;
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((x, y) => sign * compareValues(get(x), get(y)));
}

export function SortableTable<Row>({
  columns,
  rows,
  rowKey,
  caption,
  emptyState,
  initialSort,
  pageSize = 100,
}: {
  columns: SortColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  caption: string;
  emptyState: ReactNode;
  initialSort?: { key: string; direction: Direction };
  pageSize?: number;
}) {
  const [sort, setSort] = useState<{ key: string; direction: Direction } | null>(initialSort ?? null);
  const [shown, setShown] = useState(pageSize);

  const sorted = useMemo(() => sortRows(rows, columns.find((c) => c.key === sort?.key), sort?.direction ?? 'asc'), [rows, columns, sort]);

  if (rows.length === 0) return <>{emptyState}</>;

  const toggle = (key: string) =>
    setSort((cur) => (cur?.key === key ? { key, direction: cur.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'desc' }));

  return (
    <div className="space-y-2">
      <div className="sticky-table max-h-[34rem] overflow-auto rounded-card border border-line bg-surface">
        <table className="w-full min-w-max border-collapse text-[13px]">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line">
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : c.sortValue ? 'none' : undefined}
                    className={cn('label px-3 py-2.5 font-normal', c.align === 'right' ? 'text-right' : 'text-left')}
                  >
                    {c.sortValue ? (
                      <button type="button" onClick={() => toggle(c.key)} className="uppercase tracking-[0.08em] hover:text-ink focus-visible:outline-2 focus-visible:outline-signal">
                        {c.header}
                        <span aria-hidden="true" className="ml-1 inline-block w-2">
                          {active ? (sort.direction === 'asc' ? '↑' : '↓') : ''}
                        </span>
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, shown).map((row) => (
              <tr key={rowKey(row)} className="border-b border-line last:border-b-0 hover:bg-paper/70">
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-3 py-2 align-top', c.align === 'right' && 'text-right', c.mono && 'num')}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > shown ? (
        <div className="flex items-center justify-between text-[13px] text-muted">
          <span className="num">
            Showing {shown} of {sorted.length}
          </span>
          <Button variant="secondary" size="sm" onClick={() => setShown((n) => n + pageSize)}>
            Show {Math.min(pageSize, sorted.length - shown)} more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
