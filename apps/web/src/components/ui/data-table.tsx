import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface Column<Row> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  mono?: boolean;
  cell: (row: Row) => ReactNode;
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  caption,
  emptyState,
}: {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  caption: string;
  emptyState: ReactNode;
}) {
  if (rows.length === 0) return <>{emptyState}</>;
  return (
    <div className="sticky-table max-h-[34rem] overflow-auto rounded-card border border-line bg-surface">
      <table className="w-full min-w-max border-collapse text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn('label px-3 py-2.5 font-normal', c.align === 'right' ? 'text-right' : 'text-left')}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-line last:border-b-0 hover:bg-paper/70">
              {columns.map((c) => (
                <td key={c.key} className={cn('px-3 py-2', c.align === 'right' && 'text-right', c.mono && 'num')}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
