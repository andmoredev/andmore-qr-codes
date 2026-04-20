import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnalyticsBucket } from '../../types';

interface Props {
  data: AnalyticsBucket[];
  height?: number;
  label?: string;
}

function formatBucketLabel(bucket: string): string {
  // Expect YYYY-MM-DD (daily). Fall back to raw string.
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(bucket);
  if (!match) return bucket;
  const [, , mm, dd] = match;
  return `${mm}/${dd}`;
}

export function TimeSeriesChart({ data, height = 260, label = 'Scans' }: Props) {
  const points = useMemo(
    () => data.map(d => ({ bucket: d.bucket, label: formatBucketLabel(d.bucket), count: d.count })),
    [data],
  );

  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center border border-dashed border-border rounded-lg text-sm text-text-muted"
        style={{ height }}
      >
        No data for the selected range.
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
          <CartesianGrid stroke="#475569" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="#94A3B8"
            fontSize={12}
            tickLine={false}
            axisLine={{ stroke: '#475569' }}
          />
          <YAxis
            stroke="#94A3B8"
            fontSize={12}
            tickLine={false}
            axisLine={{ stroke: '#475569' }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{ background: '#1E293B', border: '1px solid #475569', color: '#F8FAFC' }}
            labelStyle={{ color: '#F8FAFC' }}
            itemStyle={{ color: '#F8FAFC' }}
            formatter={(value) => [Number(value).toLocaleString(), label]}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke="#22C55E"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#22C55E', stroke: '#0F172A', strokeWidth: 2 }}
            name={label}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
