import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, MousePointerClick, ScanLine } from 'lucide-react';
import { getQrAnalytics } from '../../services/analytics';
import type { AnalyticsSummary } from '../../types';
import { TimeSeriesChart } from './TimeSeriesChart';
import { CountryBreakdown } from './CountryBreakdown';
import { DeviceBreakdown } from './DeviceBreakdown';

interface Props {
  qrId: string;
}

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
}

function StatCard({ label, value, icon }: StatCardProps) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
        {icon}
      </div>
      <div>
        <p className="text-xs text-text-muted">{label}</p>
        <p className="text-lg font-semibold text-foreground tabular-nums">{value.toLocaleString()}</p>
      </div>
    </div>
  );
}

export function QrAnalyticsWidget({ qrId }: Props) {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getQrAnalytics(qrId)
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
  }, [qrId, retryToken]);

  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6 flex items-center gap-3 text-sm text-text-muted">
        <Loader2 className="w-4 h-4 animate-spin text-accent" />
        Loading analytics…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6 space-y-3">
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertTriangle className="w-4 h-4" />
          <span>{error}</span>
        </div>
        <button
          onClick={() => setRetryToken(t => t + 1)}
          className="text-sm text-accent hover:text-accent-hover transition-colors cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const isPageQr = data.byLink !== undefined;
  const empty = data.totalScans === 0;

  return (
    <div className="space-y-6">
      <div className={`grid gap-3 ${isPageQr ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
        <StatCard label="Total scans" value={data.totalScans} icon={<ScanLine className="w-4 h-4" />} />
        {isPageQr && (
          <StatCard
            label="Total clicks"
            value={data.totalClicks}
            icon={<MousePointerClick className="w-4 h-4" />}
          />
        )}
      </div>

      {empty ? (
        <div className="bg-surface border border-border rounded-xl py-12 flex flex-col items-center gap-2 text-center">
          <ScanLine className="w-8 h-8 text-text-muted" strokeWidth={1.5} />
          <p className="text-sm text-text-muted">No scans yet.</p>
          <p className="text-xs text-text-muted">Scan data will appear here once people start scanning your QR code.</p>
        </div>
      ) : (
        <>
          <section className="bg-surface border border-border rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Scans over time</h3>
            <TimeSeriesChart data={data.byDay} label="Scans" />
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="bg-surface border border-border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Top countries</h3>
              <CountryBreakdown data={data.byCountry} />
            </section>
            <section className="bg-surface border border-border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Devices</h3>
              <DeviceBreakdown data={data.byDevice} />
            </section>
          </div>

          {isPageQr && data.byLink && (
            <section className="bg-surface border border-border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Clicks by link</h3>
              {data.byLink.length === 0 ? (
                <p className="text-sm text-text-muted">No link clicks yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-text-muted border-b border-border">
                        <th className="font-medium py-2 pr-4">Link</th>
                        <th className="font-medium py-2 text-right">Clicks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...data.byLink]
                        .sort((a, b) => b.count - a.count)
                        .map(row => (
                          <tr key={row.linkKey} className="border-b border-border last:border-0">
                            <td className="py-2 pr-4 text-foreground truncate max-w-[20rem]" title={row.label}>
                              {row.label}
                            </td>
                            <td className="py-2 text-right tabular-nums text-foreground">
                              {row.count.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
