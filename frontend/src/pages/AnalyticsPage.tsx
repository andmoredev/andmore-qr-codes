import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Globe2,
  Link2,
  Loader2,
  MonitorSmartphone,
  MousePointerClick,
  QrCode as QrCodeIcon,
  ScanLine,
} from 'lucide-react';
import { getDashboardSummary } from '../services/analytics';
import type { AnalyticsBucket, DashboardSummary } from '../types';
import { TimeSeriesChart } from '../components/analytics/TimeSeriesChart';
import { CountryBreakdown } from '../components/analytics/CountryBreakdown';
import { DeviceBreakdown } from '../components/analytics/DeviceBreakdown';

type Range = 7 | 30 | 90;

const RANGE_OPTIONS: Array<{ label: string; value: Range }> = [
  { label: 'Last 7 days', value: 7 },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 90 days', value: 90 },
];

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  hint?: string;
}

function StatCard({ label, value, icon, hint }: StatCardProps) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex items-start gap-3">
      <div className="w-10 h-10 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-text-muted">{label}</p>
        <p className="text-2xl font-semibold text-foreground tabular-nums">{value.toLocaleString()}</p>
        {hint && <p className="text-xs text-text-muted mt-0.5 truncate">{hint}</p>}
      </div>
    </div>
  );
}

function filterBucketsByRange(buckets: AnalyticsBucket[], days: Range): AnalyticsBucket[] {
  if (buckets.length === 0) return buckets;
  // Show the last N daily buckets. Sort ascending to keep the chart left-to-right chronological.
  const sorted = [...buckets].sort((a, b) => a.bucket.localeCompare(b.bucket));
  return sorted.slice(-days);
}

export function AnalyticsPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<Range>(30);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getDashboardSummary()
      .then(res => {
        if (!cancelled) setData(res);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load analytics');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [retryToken]);

  const filteredByDay = useMemo(
    () => (data ? filterBucketsByRange(data.scansByDay, range) : []),
    [data, range],
  );

  const rangeLabel = RANGE_OPTIONS.find(o => o.value === range)?.label ?? '';

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-sm text-text-muted py-24 justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-accent" />
        Loading analytics…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface border border-border rounded-xl p-8 flex flex-col items-center gap-3 text-center">
        <AlertTriangle className="w-8 h-8 text-destructive" strokeWidth={1.5} />
        <div>
          <h2 className="text-base font-semibold text-foreground">Unable to load analytics</h2>
          <p className="text-sm text-text-muted mt-1">{error}</p>
        </div>
        <button
          onClick={() => setRetryToken(t => t + 1)}
          className="mt-2 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors duration-150 cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const hasCountry = data.byCountry.length > 0;
  const hasDevice = data.byDevice.length > 0;

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
            <BarChart3 className="w-5 h-5 text-accent" />
            Analytics
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Scan and click performance across your QR codes and pages.
          </p>
        </div>
        <div
          className="inline-flex rounded-lg border border-border bg-surface p-1 self-start sm:self-end"
          role="group"
          aria-label="Date range"
        >
          {RANGE_OPTIONS.map(opt => {
            const active = opt.value === range;
            return (
              <button
                key={opt.value}
                onClick={() => setRange(opt.value)}
                aria-pressed={active}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 cursor-pointer ${
                  active
                    ? 'bg-accent text-white'
                    : 'text-text-muted hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Summary stats */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total QR codes"
          value={data.totalQrs}
          icon={<QrCodeIcon className="w-4 h-4" />}
        />
        <StatCard
          label="Total pages"
          value={data.totalPages}
          icon={<Link2 className="w-4 h-4" />}
        />
        <StatCard
          label="Scans (last 30 days)"
          value={data.scansLast30Days}
          icon={<ScanLine className="w-4 h-4" />}
        />
        <StatCard
          label="Clicks (last 30 days)"
          value={data.clicksLast30Days}
          icon={<MousePointerClick className="w-4 h-4" />}
        />
      </section>

      {/* Scans over time — full width so the chart has room to breathe */}
      <section className="bg-surface border border-border rounded-xl p-4 sm:p-6 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Scans over time</h2>
          <span className="text-xs text-text-muted">{rangeLabel}</span>
        </div>
        <TimeSeriesChart data={filteredByDay} label="Scans" />
      </section>

      {/* Country + Device breakdowns: side-by-side at >=1024px, stacked below */}
      {(hasCountry || hasDevice) && (
        <section
          className={`grid grid-cols-1 gap-4 ${
            hasCountry && hasDevice ? 'lg:grid-cols-2' : ''
          }`}
        >
          {hasCountry && (
            <div className="bg-surface border border-border rounded-xl p-4 sm:p-6 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Globe2 className="w-4 h-4 text-text-muted" />
                  Scans by country
                </h2>
                <span className="text-xs text-text-muted">Last 30 days</span>
              </div>
              <CountryBreakdown data={data.byCountry} />
            </div>
          )}

          {hasDevice && (
            <div className="bg-surface border border-border rounded-xl p-4 sm:p-6 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <MonitorSmartphone className="w-4 h-4 text-text-muted" />
                  Scans by device
                </h2>
                <span className="text-xs text-text-muted">Last 30 days</span>
              </div>
              <DeviceBreakdown data={data.byDevice} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
