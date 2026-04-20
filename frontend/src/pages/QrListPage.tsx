import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, QrCode as QrIcon, Search } from 'lucide-react';
import { listQrs } from '../services/qrs';
import type { QrCode, QrType } from '../types';
import { QrCard } from '../components/QrCard';

type FilterType = 'all' | QrType;

export function QrListPage() {
  const [qrs, setQrs] = useState<QrCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nameFilter, setNameFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listQrs()
      .then(items => {
        if (!cancelled) setQrs(items);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load QR codes');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = nameFilter.trim().toLowerCase();
    return qrs.filter(q => {
      if (typeFilter !== 'all' && q.type !== typeFilter) return false;
      if (needle && !q.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [qrs, nameFilter, typeFilter]);

  const typeButton = (value: FilterType, label: string) => (
    <button
      key={value}
      onClick={() => setTypeFilter(value)}
      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors duration-150 cursor-pointer ${
        typeFilter === value
          ? 'bg-accent text-white border-accent'
          : 'bg-muted text-text-muted border-border hover:text-foreground'
      }`}
      aria-pressed={typeFilter === value}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
            <QrIcon className="w-5 h-5 text-accent" />
            QR Codes
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Manage your QR codes — direct links and Links-Page-backed.
          </p>
        </div>
        <Link
          to="/qrs/new"
          className="inline-flex items-center gap-1.5 bg-accent hover:bg-accent-hover text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150"
          aria-label="Create new QR code"
        >
          <Plus className="w-4 h-4" />
          New QR
        </Link>
      </header>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={nameFilter}
            onChange={e => setNameFilter(e.target.value)}
            placeholder="Filter by name"
            aria-label="Filter QR codes by name"
            className="w-full bg-muted border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-150"
          />
        </div>
        <div className="flex items-center gap-2" role="group" aria-label="Filter by type">
          {typeButton('all', 'All')}
          {typeButton('direct', 'Direct')}
          {typeButton('page', 'Page')}
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/40 text-destructive text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-xl p-4 space-y-3 animate-pulse">
              <div className="aspect-square bg-muted rounded-lg" />
              <div className="h-3 bg-muted rounded w-3/4" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : qrs.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl py-16 flex flex-col items-center gap-3 text-center px-6">
          <QrIcon className="w-10 h-10 text-accent" strokeWidth={1.5} />
          <div className="space-y-1">
            <p className="text-sm text-foreground">No QR codes yet</p>
            <p className="text-sm text-text-muted">Get started by creating your first QR code.</p>
          </div>
          <Link
            to="/qrs/new"
            className="mt-2 inline-flex items-center gap-1.5 bg-accent hover:bg-accent-hover text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150"
          >
            <Plus className="w-4 h-4" />
            Create your first QR
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl py-16 flex flex-col items-center gap-2 text-center px-6">
          <p className="text-sm text-text-muted">
            No QR codes match your filters.
          </p>
          <button
            onClick={() => {
              setNameFilter('');
              setTypeFilter('all');
            }}
            className="text-xs text-accent hover:underline cursor-pointer"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(qr => (
            <QrCard key={qr.qrId} qr={qr} />
          ))}
        </div>
      )}
    </div>
  );
}
