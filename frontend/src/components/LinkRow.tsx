import { ChevronUp, ChevronDown, Trash2, GripVertical } from 'lucide-react';
import type { LinkItem, LinkKind } from '../types';

interface Props {
  link: LinkItem;
  index: number;
  total: number;
  onChange: (patch: Partial<LinkItem>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}

const kindOptions: Array<{ value: LinkKind; label: string }> = [
  { value: 'x', label: 'X (Twitter)' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'github', label: 'GitHub' },
  { value: 'blog', label: 'Blog' },
  { value: 'custom', label: 'Custom' },
];

interface HandleConfig {
  base: string;
  showAt: boolean;
  placeholder: string;
  fieldLabel: string;
}

const HANDLE_CONFIG: Record<string, HandleConfig> = {
  x:        { base: 'https://x.com/',          showAt: true,  placeholder: 'yourhandle',   fieldLabel: 'Handle' },
  github:   { base: 'https://github.com/',      showAt: true,  placeholder: 'yourhandle',   fieldLabel: 'Handle' },
  linkedin: { base: 'https://linkedin.com/in/', showAt: false, placeholder: 'your-profile', fieldLabel: 'Profile slug' },
  youtube:  { base: 'https://youtube.com/@',    showAt: true,  placeholder: 'yourchannel',  fieldLabel: 'Handle' },
};

function urlToHandle(kind: string, url: string): string {
  const cfg = HANDLE_CONFIG[kind];
  if (!cfg || !url) return url ?? '';
  if (url.startsWith(cfg.base)) return url.slice(cfg.base.length);
  return url;
}

function handleToUrl(kind: string, raw: string): string {
  const cfg = HANDLE_CONFIG[kind];
  if (!cfg) return raw;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  const handle = raw.replace(/^@/, '').trim();
  if (!handle) return '';
  return cfg.base + handle;
}

export function LinkRow({ link, index, total, onChange, onMoveUp, onMoveDown, onRemove }: Props) {
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const handleCfg = HANDLE_CONFIG[link.kind];
  const isHandleKind = !!handleCfg;

  const handleValue = isHandleKind ? urlToHandle(link.kind, link.url) : link.url;
  const resolvedUrl = isHandleKind ? handleToUrl(link.kind, handleValue) : link.url;
  const showPreview = isHandleKind && !!resolvedUrl && resolvedUrl !== handleValue;

  return (
    <div className="bg-muted border border-border rounded-lg p-3 space-y-3">
      <div className="flex items-center gap-2">
        <GripVertical className="w-4 h-4 text-text-muted" aria-hidden="true" />
        <span className="text-xs text-text-muted">Link {index + 1}</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          className="p-1 rounded text-text-muted hover:text-foreground hover:bg-surface transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          aria-label="Move link up"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          className="p-1 rounded text-text-muted hover:text-foreground hover:bg-surface transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          aria-label="Move link down"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="p-1 rounded text-text-muted hover:text-destructive hover:bg-surface transition-colors cursor-pointer"
          aria-label="Remove link"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label
            htmlFor={`link-kind-${link.linkKey}`}
            className="block text-xs font-medium text-text-muted"
          >
            Type
          </label>
          <select
            id={`link-kind-${link.linkKey}`}
            value={link.kind}
            onChange={(e) => {
              const newKind = e.target.value as LinkKind;
              const newCfg = HANDLE_CONFIG[newKind];
              // Re-derive URL when switching between kinds
              const currentHandle = HANDLE_CONFIG[link.kind]
                ? urlToHandle(link.kind, link.url)
                : link.url;
              const newUrl = newCfg ? handleToUrl(newKind, currentHandle) : link.url;
              onChange({ kind: newKind, url: newUrl });
            }}
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-150"
          >
            {kindOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label
            htmlFor={`link-label-${link.linkKey}`}
            className="block text-xs font-medium text-text-muted"
          >
            Label
          </label>
          <input
            id={`link-label-${link.linkKey}`}
            type="text"
            value={link.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="e.g. My LinkedIn"
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-150"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label
          htmlFor={`link-url-${link.linkKey}`}
          className="block text-xs font-medium text-text-muted"
        >
          {isHandleKind ? handleCfg.fieldLabel : 'URL'}
        </label>
        {isHandleKind ? (
          <div className="space-y-1">
            <div className="relative flex items-center">
              {handleCfg.showAt && (
                <span className="absolute left-3 text-sm text-text-muted select-none pointer-events-none">
                  @
                </span>
              )}
              <input
                id={`link-url-${link.linkKey}`}
                type="text"
                value={handleValue}
                onChange={(e) => onChange({ url: handleToUrl(link.kind, e.target.value) })}
                placeholder={handleCfg.placeholder}
                className={`w-full bg-surface border border-border rounded-lg py-2 text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-150 ${handleCfg.showAt ? 'pl-7 pr-3' : 'px-3'}`}
              />
            </div>
            {showPreview && (
              <p className="text-xs text-text-muted truncate" title={resolvedUrl}>
                {resolvedUrl}
              </p>
            )}
          </div>
        ) : (
          <input
            id={`link-url-${link.linkKey}`}
            type="url"
            value={link.url}
            onChange={(e) => onChange({ url: e.target.value })}
            placeholder="https://example.com"
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-150"
          />
        )}
      </div>

      {link.kind === 'custom' && (
        <div className="space-y-1">
          <label
            htmlFor={`link-icon-${link.linkKey}`}
            className="block text-xs font-medium text-text-muted"
          >
            Icon <span className="text-text-muted font-normal">(lucide icon name)</span>
          </label>
          <input
            id={`link-icon-${link.linkKey}`}
            type="text"
            value={link.icon ?? ''}
            onChange={(e) => onChange({ icon: e.target.value })}
            placeholder="e.g. Rocket"
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-150"
          />
        </div>
      )}
    </div>
  );
}
