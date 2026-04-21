import { useMemo } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { DeviceType } from '../../types';

interface DeviceRow {
  deviceType: DeviceType;
  count: number;
}

interface Props {
  data: DeviceRow[];
  height?: number;
}

const LABELS: Record<DeviceType, string> = {
  mobile: 'Mobile',
  tablet: 'Tablet',
  desktop: 'Desktop',
  bot: 'Bot',
  unknown: 'Unknown',
};

// Accent first, then supporting slate/blue tones that sit well on the dark theme.
const COLORS = ['#22C55E', '#38BDF8', '#A78BFA', '#F59E0B', '#64748B'];

export function DeviceBreakdown({ data, height = 220 }: Props) {
  const rows = useMemo(() => {
    const filtered = data.filter(d => d.count > 0);
    return filtered.map((d, idx) => ({
      name: LABELS[d.deviceType] ?? d.deviceType,
      value: d.count,
      fill: COLORS[idx % COLORS.length],
    }));
  }, [data]);

  const total = rows.reduce((sum, r) => sum + r.value, 0);

  if (rows.length === 0 || total === 0) {
    return <p className="text-sm text-text-muted">No device data yet.</p>;
  }

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <div className="w-40 shrink-0" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows}
              dataKey="value"
              nameKey="name"
              innerRadius={45}
              outerRadius={70}
              stroke="#0F172A"
              strokeWidth={2}
            >
              {rows.map(entry => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: '#1E293B', border: '1px solid #475569', color: '#F8FAFC' }}
              itemStyle={{ color: '#F8FAFC' }}
              formatter={(value, name) => [Number(value).toLocaleString(), String(name)]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex-1 space-y-1.5 w-full">
        {rows.map(row => {
          const pct = Math.round((row.value / total) * 100);
          return (
            <li key={row.name} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-foreground">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: row.fill }}
                  aria-hidden
                />
                {row.name}
              </span>
              <span className="text-text-muted tabular-nums whitespace-nowrap">
                {row.value.toLocaleString()} <span className="text-xs">({pct}%)</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
