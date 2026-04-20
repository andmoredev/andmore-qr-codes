import { useEffect, useState } from 'react';
import { History, RotateCcw, AlertCircle } from 'lucide-react';
import { listPageVersions, restorePageVersion } from '../services/pages';
import type { LinkPage, VersionMeta } from '../types';

interface Props {
  pageId: string;
  currentVersion: number;
  onRestored: (page: LinkPage) => void;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function VersionsPanel({ pageId, currentVersion, onRestored }: Props) {
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    setError('');
    listPageVersions(pageId)
      .then((items) => setVersions(items))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load versions'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, currentVersion]);

  const handleRestore = async (version: number) => {
    setRestoringVersion(version);
    setError('');
    try {
      const restored = await restorePageVersion(pageId, version);
      onRestored(restored);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setRestoringVersion(null);
    }
  };

  return (
    <section className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <History className="w-4 h-4 text-accent" />
        <h2 className="font-semibold text-foreground">Versions</h2>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/40 rounded-lg px-3 py-2 text-sm text-destructive flex items-center gap-2 mb-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-text-muted">Loading versions…</p>
      ) : versions.length === 0 ? (
        <p className="text-sm text-text-muted">No previous versions yet.</p>
      ) : (
        <ul className="space-y-2">
          {versions.map((v) => {
            const isCurrent = v.version === currentVersion;
            return (
              <li
                key={v.version}
                className="flex items-center gap-3 bg-muted border border-border rounded-lg px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">
                    Version {v.version}
                    {isCurrent && (
                      <span className="ml-2 text-xs text-accent">current</span>
                    )}
                  </p>
                  <p className="text-xs text-text-muted">
                    {formatTime(v.versionedAt)}
                    {v.note ? ` · ${v.note}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRestore(v.version)}
                  disabled={isCurrent || restoringVersion !== null}
                  className="flex items-center gap-1.5 text-xs text-text-muted hover:text-foreground transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {restoringVersion === v.version ? (
                    <span className="w-3 h-3 border-2 border-text-muted border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" />
                  )}
                  Restore
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
