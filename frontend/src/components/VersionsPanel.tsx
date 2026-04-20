import { useEffect, useState } from 'react';
import { History, RotateCcw } from 'lucide-react';
import type { VersionMeta } from '../types';

interface Props {
  loader: () => Promise<VersionMeta[]>;
  restore: (version: number) => Promise<unknown>;
  onRestored?: () => void;
  reloadKey?: number;
}

export function VersionsPanel({ loader, restore, onRestored, reloadKey }: Props) {
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    loader()
      .then(items => {
        if (cancelled) return;
        const sorted = [...items].sort((a, b) => b.version - a.version);
        setVersions(sorted);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load versions');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const handleRestore = async (version: number) => {
    setRestoringVersion(version);
    setError('');
    try {
      await restore(version);
      onRestored?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setRestoringVersion(null);
    }
  };

  return (
    <section className="bg-surface border border-border rounded-xl p-4 space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <History className="w-4 h-4 text-text-muted" />
        Versions
      </h3>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : versions.length === 0 ? (
        <p className="text-sm text-text-muted">No previous versions yet.</p>
      ) : (
        <ul className="space-y-2">
          {versions.map(v => (
            <li
              key={v.version}
              className="flex items-center justify-between gap-2 bg-muted border border-border rounded-lg px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm text-foreground">v{v.version}</p>
                <p className="text-xs text-text-muted truncate" title={v.note ?? ''}>
                  {new Date(v.versionedAt).toLocaleString()}
                  {v.note ? ` — ${v.note}` : ''}
                </p>
              </div>
              <button
                onClick={() => handleRestore(v.version)}
                disabled={restoringVersion !== null}
                className="inline-flex items-center gap-1 text-xs text-foreground hover:text-accent transition-colors duration-150 disabled:opacity-50 cursor-pointer"
                aria-label={`Restore version ${v.version}`}
              >
                {restoringVersion === v.version ? (
                  <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                ) : (
                  <RotateCcw className="w-3 h-3" />
                )}
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
