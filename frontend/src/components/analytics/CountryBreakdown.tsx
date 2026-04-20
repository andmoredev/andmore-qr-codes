import { useMemo } from 'react';

interface CountryRow {
  country: string;
  count: number;
}

interface Props {
  data: CountryRow[];
  topN?: number;
}

function prettyCountry(code: string): string {
  if (!code || code === 'unknown' || code === 'UNKNOWN') return 'Unknown';
  return code.toUpperCase();
}

export function CountryBreakdown({ data, topN = 5 }: Props) {
  const rows = useMemo(() => {
    if (data.length === 0) return [] as Array<CountryRow & { pct: number }>;
    const sorted = [...data].sort((a, b) => b.count - a.count);
    const top = sorted.slice(0, topN);
    const rest = sorted.slice(topN);
    const combined = rest.length > 0
      ? [...top, { country: 'Other', count: rest.reduce((sum, r) => sum + r.count, 0) }]
      : top;
    const total = combined.reduce((sum, r) => sum + r.count, 0) || 1;
    return combined.map(r => ({ ...r, pct: Math.round((r.count / total) * 100) }));
  }, [data, topN]);

  if (rows.length === 0) {
    return <p className="text-sm text-text-muted">No country data yet.</p>;
  }

  const max = rows[0]?.count ?? 1;

  return (
    <ul className="space-y-2">
      {rows.map(row => {
        const widthPct = Math.max(4, Math.round((row.count / max) * 100));
        return (
          <li key={row.country} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground">{prettyCountry(row.country)}</span>
              <span className="text-text-muted tabular-nums">
                {row.count.toLocaleString()} <span className="text-xs">({row.pct}%)</span>
              </span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden" aria-hidden>
              <div className="h-full bg-accent rounded-full" style={{ width: `${widthPct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
