import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  QrCode,
  Link2,
  ScanLine,
  MousePointerClick,
  Plus,
  ArrowRight,
  FileText,
  Sparkles,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  TooltipProps,
} from 'recharts';
import { getDashboardSummary } from '../services/analytics';
import type { DashboardSummary } from '../types';

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  trend?: string;
}

function StatCard({ label, value, icon, trend = 'Last 30 days' }: StatCardProps) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-text-muted">{label}</span>
        <span className="text-accent">{icon}</span>
      </div>
      <div className="text-2xl font-semibold text-foreground">
        {value.toLocaleString()}
      </div>
      <span className="text-xs text-text-muted">{trend}</span>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-text-muted mb-0.5">{label}</p>
      <p className="text-sm font-medium text-foreground">
        {payload[0].value?.toLocaleString()} scans
      </p>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

function EmptyState() {
  return (
    <div className="bg-surface border border-border rounded-xl px-6 py-16 flex flex-col items-center text-center gap-6">
      <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center">
        <Sparkles className="w-7 h-7 text-accent" strokeWidth={1.5} />
      </div>
      <div className="space-y-2 max-w-md">
        <h2 className="text-xl font-semibold text-foreground">Welcome to QR Codes</h2>
        <p className="text-sm text-text-muted">
          Create dynamic QR codes that you can rewire any time, and build a simple
          link page to showcase everything in one place. Scan analytics are rolled
          up automatically.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          to="/qrs/new"
          className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors duration-150"
        >
          <Plus className="w-4 h-4" />
          Create your first QR
        </Link>
        <Link
          to="/pages/new"
          className="inline-flex items-center gap-2 bg-muted border border-border hover:border-accent/50 text-foreground font-medium rounded-lg px-4 py-2.5 text-sm transition-colors duration-150"
        >
          <Link2 className="w-4 h-4" />
          Build a Links Page
        </Link>
      </div>
      <ul className="text-xs text-text-muted grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 w-full max-w-lg">
        <li className="flex flex-col items-center gap-1">
          <QrCode className="w-4 h-4 text-accent" />
          <span>Generate QRs with optional logos</span>
        </li>
        <li className="flex flex-col items-center gap-1">
          <Link2 className="w-4 h-4 text-accent" />
          <span>Publish one page for all your links</span>
        </li>
        <li className="flex flex-col items-center gap-1">
          <ScanLine className="w-4 h-4 text-accent" />
          <span>Track scans and clicks in real time</span>
        </li>
      </ul>
    </div>
  );
}

function RecentQrs({ items }: { items: DashboardSummary['recentQrs'] }) {
  return (
    <section className="bg-surface border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <QrCode className="w-4 h-4 text-text-muted" />
          Recent QRs
        </h2>
        <Link
          to="/qrs"
          className="flex items-center gap-1 text-xs text-text-muted hover:text-foreground transition-colors duration-150"
        >
          View all
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-text-muted py-6 text-center">No QR codes yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map(qr => (
            <li key={qr.qrId}>
              <Link
                to={`/qrs/${qr.qrId}`}
                className="flex items-center justify-between gap-3 py-3 group"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground truncate group-hover:text-accent transition-colors duration-150">
                    {qr.name}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {qr.type === 'page' ? 'Links page' : 'Direct URL'} · {formatRelative(qr.updatedAt)}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-accent transition-colors duration-150 flex-shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentPages({ items }: { items: DashboardSummary['recentPages'] }) {
  return (
    <section className="bg-surface border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <FileText className="w-4 h-4 text-text-muted" />
          Recent Links Pages
        </h2>
        <Link
          to="/pages"
          className="flex items-center gap-1 text-xs text-text-muted hover:text-foreground transition-colors duration-150"
        >
          View all
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-text-muted py-6 text-center">No pages yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map(page => (
            <li key={page.pageId}>
              <Link
                to={`/pages/${page.pageId}`}
                className="flex items-center justify-between gap-3 py-3 group"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground truncate group-hover:text-accent transition-colors duration-150">
                    {page.displayName}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    /{page.slug} · {page.status === 'published' ? 'Published' : 'Draft'} · {formatRelative(page.updatedAt)}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-accent transition-colors duration-150 flex-shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ScanTrendChart({ data }: { data: DashboardSummary['scansByDay'] }) {
  const chartData = data.map(d => ({ date: formatDate(d.bucket), scans: d.count }));
  const totalScans = data.reduce((acc, d) => acc + d.count, 0);

  return (
    <section className="bg-surface border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ScanLine className="w-4 h-4 text-text-muted" />
          Scan Trend
        </h2>
        <span className="text-xs text-text-muted">Last 30 days</span>
      </div>
      {totalScans === 0 ? (
        <p className="text-sm text-text-muted py-12 text-center">
          No scans recorded in the last 30 days.
        </p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 16, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="#272F42" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="#94A3B8"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#475569' }}
              />
              <YAxis
                stroke="#94A3B8"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#475569' }}
                allowDecimals={false}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#475569', strokeDasharray: '3 3' }} />
              <Line
                type="monotone"
                dataKey="scans"
                stroke="#22C55E"
                strokeWidth={2}
                dot={{ r: 3, fill: '#22C55E', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#22C55E', stroke: '#0F172A', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDashboardSummary()
      .then(data => {
        if (!cancelled) setSummary(data);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-xl p-4 h-28 animate-pulse" />
          ))}
        </div>
        <div className="h-24 bg-surface border border-border rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64 bg-surface border border-border rounded-xl animate-pulse" />
          <div className="h-64 bg-surface border border-border rounded-xl animate-pulse" />
        </div>
        <div className="h-72 bg-surface border border-border rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface border border-destructive/40 rounded-xl p-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!summary) return null;

  const isEmpty = summary.totalQrs === 0 && summary.totalPages === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-text-muted mt-0.5">
            A quick look at your QR codes, pages, and scan activity.
          </p>
        </div>
        {!isEmpty && (
          <div className="flex gap-2">
            <Link
              to="/qrs/new"
              className="inline-flex items-center gap-1.5 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg px-3.5 py-2 text-sm transition-colors duration-150"
            >
              <Plus className="w-4 h-4" />
              New QR
            </Link>
            <Link
              to="/pages/new"
              className="inline-flex items-center gap-1.5 bg-muted border border-border hover:border-accent/50 text-foreground font-medium rounded-lg px-3.5 py-2 text-sm transition-colors duration-150"
            >
              <Plus className="w-4 h-4" />
              New Links Page
            </Link>
          </div>
        )}
      </div>

      {isEmpty ? (
        <EmptyState />
      ) : (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total QRs"
              value={summary.totalQrs}
              icon={<QrCode className="w-4 h-4" />}
              trend="All time"
            />
            <StatCard
              label="Total Pages"
              value={summary.totalPages}
              icon={<Link2 className="w-4 h-4" />}
              trend="All time"
            />
            <StatCard
              label="Scans"
              value={summary.scansLast30Days}
              icon={<ScanLine className="w-4 h-4" />}
              trend="Last 30 days"
            />
            <StatCard
              label="Clicks"
              value={summary.clicksLast30Days}
              icon={<MousePointerClick className="w-4 h-4" />}
              trend="Last 30 days"
            />
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RecentQrs items={summary.recentQrs} />
            <RecentPages items={summary.recentPages} />
          </div>

          <ScanTrendChart data={summary.scansByDay} />
        </>
      )}
    </div>
  );
}
