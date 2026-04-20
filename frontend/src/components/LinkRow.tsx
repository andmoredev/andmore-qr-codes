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

export function LinkRow({ link, index, total, onChange, onMoveUp, onMoveDown, onRemove }: Props) {
  const isFirst = index === 0;
  const isLast = index === total - 1;

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
            onChange={(e) => onChange({ kind: e.target.value as LinkKind })}
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
          URL
        </label>
        <input
          id={`link-url-${link.linkKey}`}
          type="url"
          value={link.url}
          onChange={(e) => onChange({ url: e.target.value })}
          placeholder="https://example.com"
          className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-150"
        />
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
