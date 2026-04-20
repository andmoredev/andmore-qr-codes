import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Send,
  EyeOff,
  Trash2,
  Plus,
  AlertCircle,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import {
  ApiError,
  createPage,
  deletePage,
  getPage,
  listPageVersions,
  publishPage,
  restorePageVersion,
  updatePage,
} from '../services/pages';
import type {
  LinkItem,
  LinkPage,
  Theme,
  CreatePageRequest,
  UpdatePageRequest,
} from '../types';
import { AvatarUploader } from '../components/AvatarUploader';
import { LinkRow } from '../components/LinkRow';
import { LivePagePreview } from '../components/LivePagePreview';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { VersionsPanel } from '../components/VersionsPanel';

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const RESERVED_SLUGS = new Set([
  'unavailable',
  'admin',
  'api',
  'login',
  'signup',
  'p',
  'r',
  'l',
  'public',
  'assets',
  'static',
  'dashboard',
]);

const BIO_MAX = 200;

function validateSlug(slug: string): string | null {
  if (!slug) return 'Slug is required';
  if (slug.length < 3) return 'Slug must be at least 3 characters';
  if (slug.length > 30) return 'Slug must be at most 30 characters';
  if (!SLUG_REGEX.test(slug)) {
    return 'Use lowercase letters, numbers, and hyphens. Cannot start or end with a hyphen.';
  }
  if (RESERVED_SLUGS.has(slug)) return 'That slug is reserved';
  return null;
}

function newLinkKey(): string {
  return `l_${Math.random().toString(36).slice(2, 9)}`;
}

function blankLink(order: number): LinkItem {
  return {
    linkKey: newLinkKey(),
    kind: 'custom',
    label: '',
    url: '',
    order,
  };
}

type Mode = 'create' | 'edit';

interface FormState {
  slug: string;
  displayName: string;
  bio: string;
  theme: Theme;
  accentColor: string;
  links: LinkItem[];
  /** Remote avatar URL from the server, if any. */
  avatarUrl: string | null;
  /** base64 (no prefix) if the user uploaded a new image in this session. */
  avatarBase64: string | null;
  /** True if the user hit Remove. On save this sends avatarBase64: null. */
  avatarCleared: boolean;
}

const DEFAULT_FORM: FormState = {
  slug: '',
  displayName: '',
  bio: '',
  theme: 'dark',
  accentColor: '#22C55E',
  links: [],
  avatarUrl: null,
  avatarBase64: null,
  avatarCleared: false,
};

function formFromPage(p: LinkPage): FormState {
  return {
    slug: p.slug,
    displayName: p.displayName,
    bio: p.bio ?? '',
    theme: p.theme,
    accentColor: p.accentColor,
    links: [...p.links].sort((a, b) => a.order - b.order),
    avatarUrl: p.avatarUrl ?? null,
    avatarBase64: null,
    avatarCleared: false,
  };
}

export function PageEditorPage() {
  const navigate = useNavigate();
  const { pageId } = useParams<{ pageId: string }>();
  const mode: Mode = pageId ? 'edit' : 'create';

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [page, setPage] = useState<LinkPage | null>(null);
  const [loading, setLoading] = useState(mode === 'edit');
  const [loadError, setLoadError] = useState('');

  const [slugTaken, setSlugTaken] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState<false | 'draft' | 'publish'>(false);

  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (mode !== 'edit' || !pageId) return;
    getPage(pageId)
      .then((p) => {
        setPage(p);
        setForm(formFromPage(p));
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load page'))
      .finally(() => setLoading(false));
  }, [mode, pageId]);

  const slugError = useMemo(() => {
    if (!form.slug) return null;
    return validateSlug(form.slug);
  }, [form.slug]);

  const slugFieldError = slugTaken ? 'That slug is already taken' : slugError;

  const canSubmit =
    !!form.slug &&
    !slugError &&
    !!form.displayName.trim() &&
    form.bio.length <= BIO_MAX;

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const updateLink = (index: number, patch: Partial<LinkItem>) => {
    setForm((f) => {
      const links = f.links.slice();
      links[index] = { ...links[index], ...patch };
      return { ...f, links };
    });
  };

  const moveLink = (index: number, delta: -1 | 1) => {
    setForm((f) => {
      const next = f.links.slice();
      const target = index + delta;
      if (target < 0 || target >= next.length) return f;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...f, links: next.map((l, i) => ({ ...l, order: i })) };
    });
  };

  const removeLink = (index: number) => {
    setForm((f) => {
      const next = f.links.filter((_, i) => i !== index);
      return { ...f, links: next.map((l, i) => ({ ...l, order: i })) };
    });
  };

  const addLink = () => {
    setForm((f) => ({ ...f, links: [...f.links, blankLink(f.links.length)] }));
  };

  const buildCreateBody = (): CreatePageRequest => ({
    slug: form.slug,
    displayName: form.displayName.trim(),
    bio: form.bio,
    theme: form.theme,
    accentColor: form.accentColor,
    links: form.links.map((l, i) => ({ ...l, order: i })),
  });

  const buildUpdateBody = (): UpdatePageRequest => {
    const body: UpdatePageRequest = {
      slug: form.slug,
      displayName: form.displayName.trim(),
      bio: form.bio,
      theme: form.theme,
      accentColor: form.accentColor,
      links: form.links.map((l, i) => ({ ...l, order: i })),
    };
    if (form.avatarBase64) body.avatarBase64 = form.avatarBase64;
    else if (form.avatarCleared) body.avatarBase64 = null;
    return body;
  };

  const handleSave = async (andPublish: boolean) => {
    if (!canSubmit || saving) return;
    setSaving(andPublish ? 'publish' : 'draft');
    setSaveError('');
    setSlugTaken(false);
    try {
      let saved: LinkPage;
      if (mode === 'create') {
        saved = await createPage(buildCreateBody());
      } else if (pageId) {
        saved = await updatePage(pageId, buildUpdateBody());
      } else {
        throw new Error('Missing page id');
      }

      if (andPublish && saved.status !== 'published') {
        saved = await publishPage(saved.pageId, true);
      }

      setPage(saved);
      setForm(formFromPage(saved));

      if (mode === 'create') {
        navigate(`/pages/${saved.pageId}`, { replace: true });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setSlugTaken(true);
      } else {
        setSaveError(err instanceof Error ? err.message : 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async () => {
    if (!page || publishing) return;
    setPublishing(true);
    setSaveError('');
    try {
      const updated = await publishPage(page.pageId, page.status !== 'published');
      setPage(updated);
      setForm(formFromPage(updated));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Publish toggle failed');
    } finally {
      setPublishing(false);
    }
  };

  const handleDelete = async () => {
    if (!page || deleting) return;
    setDeleting(true);
    setSaveError('');
    try {
      await deletePage(page.pageId);
      navigate('/pages');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Delete failed');
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const avatarPreviewSrc = form.avatarBase64
    ? `data:image/*;base64,${form.avatarBase64}`
    : form.avatarCleared
      ? null
      : form.avatarUrl;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-text-muted">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading page…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <RouterLink
          to="/pages"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Pages
        </RouterLink>
        <div className="bg-destructive/10 border border-destructive/40 rounded-lg px-4 py-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      </div>
    );
  }

  const publicHref = form.slug ? `/p/${form.slug}` : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <RouterLink
            to="/pages"
            className="text-text-muted hover:text-foreground transition-colors"
            aria-label="Back to Pages"
          >
            <ArrowLeft className="w-5 h-5" />
          </RouterLink>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              {mode === 'create' ? 'New Links Page' : form.displayName || 'Edit Links Page'}
            </h1>
            {mode === 'edit' && page && (
              <p className="text-sm text-text-muted">
                {page.status === 'published' ? 'Published' : 'Draft'}
                {publicHref && (
                  <>
                    {' · '}
                    <button
                      type="button"
                      onClick={() => window.open(publicHref, '_blank', 'noopener')}
                      className="inline-flex items-center gap-1 hover:text-accent transition-colors"
                    >
                      {publicHref}
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </>
                )}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {mode === 'edit' && page && (
            <>
              <button
                type="button"
                onClick={handleTogglePublish}
                disabled={publishing}
                className="flex items-center gap-1.5 bg-muted hover:bg-surface border border-border text-foreground font-medium rounded-lg px-3 py-2 text-sm transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {publishing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : page.status === 'published' ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {page.status === 'published' ? 'Unpublish' : 'Publish'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 text-destructive hover:bg-destructive/10 border border-destructive/40 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={!canSubmit || saving !== false}
            className="flex items-center gap-1.5 bg-muted hover:bg-surface border border-border text-foreground font-medium rounded-lg px-3 py-2 text-sm transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {saving === 'draft' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Draft
          </button>
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={!canSubmit || saving !== false}
            className="flex items-center gap-1.5 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg px-3 py-2 text-sm transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {saving === 'publish' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Save & Publish
          </button>
        </div>
      </div>

      {saveError && (
        <div className="bg-destructive/10 border border-destructive/40 rounded-lg px-4 py-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live preview — on mobile this sits below (via order) */}
        <section className="order-2 lg:order-1 space-y-3 lg:sticky lg:top-6 lg:self-start">
          <h2 className="text-sm font-medium text-text-muted">Live preview</h2>
          <LivePagePreview
            displayName={form.displayName.trim() || 'Your name'}
            bio={form.bio}
            avatarSrc={avatarPreviewSrc}
            theme={form.theme}
            accentColor={form.accentColor}
            links={form.links.map((l) => ({
              linkKey: l.linkKey,
              kind: l.kind,
              label: l.label,
              url: l.url,
              icon: l.icon,
            }))}
          />
        </section>

        {/* Form */}
        <section className="order-1 lg:order-2 space-y-6">
          <div className="bg-surface border border-border rounded-xl p-5 space-y-5">
            <h2 className="font-semibold text-foreground">Profile</h2>

            <div className="space-y-1.5">
              <label htmlFor="slug" className="block text-sm font-medium text-foreground">
                Slug
              </label>
              <div className="flex items-stretch">
                <span className="inline-flex items-center px-3 bg-muted border border-r-0 border-border rounded-l-lg text-sm text-text-muted">
                  /p/
                </span>
                <input
                  id="slug"
                  type="text"
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTaken(false);
                    updateField('slug', e.target.value.toLowerCase());
                  }}
                  placeholder="your-handle"
                  aria-invalid={!!slugFieldError}
                  className={`flex-1 bg-muted border border-border rounded-r-lg px-3 py-2.5 text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-150 ${
                    slugFieldError ? 'border-destructive ring-1 ring-destructive' : ''
                  }`}
                />
              </div>
              {slugFieldError && (
                <p className="text-xs text-destructive">{slugFieldError}</p>
              )}
              <p className="text-xs text-text-muted">
                3–30 chars, lowercase letters, numbers, hyphens. Reserved words are not allowed.
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="displayName" className="block text-sm font-medium text-foreground">
                Display name
              </label>
              <input
                id="displayName"
                type="text"
                value={form.displayName}
                onChange={(e) => updateField('displayName', e.target.value)}
                placeholder="Your name"
                className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-150"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="bio" className="flex items-center justify-between text-sm font-medium text-foreground">
                <span>Bio <span className="text-text-muted font-normal">(optional)</span></span>
                <span className={`text-xs font-normal ${form.bio.length > BIO_MAX ? 'text-destructive' : 'text-text-muted'}`}>
                  {form.bio.length}/{BIO_MAX}
                </span>
              </label>
              <textarea
                id="bio"
                rows={3}
                value={form.bio}
                onChange={(e) => updateField('bio', e.target.value)}
                placeholder="A short line about you or your page"
                className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-150 resize-y"
              />
            </div>

            <div className="space-y-1.5">
              <span className="block text-sm font-medium text-foreground">Avatar</span>
              <AvatarUploader
                previewSrc={avatarPreviewSrc}
                onChange={(base64) =>
                  setForm((f) => ({
                    ...f,
                    avatarBase64: base64,
                    avatarCleared: false,
                  }))
                }
                onRemove={() =>
                  setForm((f) => ({
                    ...f,
                    avatarBase64: null,
                    avatarCleared: true,
                  }))
                }
              />
            </div>
          </div>

          <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-foreground">Appearance</h2>

            <div className="space-y-1.5">
              <span className="block text-sm font-medium text-foreground">Theme</span>
              <div className="flex items-center gap-2">
                {(['dark', 'light'] as Theme[]).map((t) => (
                  <label
                    key={t}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                      form.theme === t
                        ? 'border-accent bg-accent/10 text-foreground'
                        : 'border-border bg-muted text-text-muted hover:text-foreground'
                    }`}
                  >
                    <input
                      type="radio"
                      name="theme"
                      value={t}
                      checked={form.theme === t}
                      onChange={() => updateField('theme', t)}
                      className="sr-only"
                    />
                    <span className="text-sm capitalize">{t}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="accentColor" className="block text-sm font-medium text-foreground">
                Accent color
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="accentColor"
                  type="color"
                  value={form.accentColor}
                  onChange={(e) => updateField('accentColor', e.target.value)}
                  className="h-10 w-14 bg-muted border border-border rounded-lg cursor-pointer"
                />
                <input
                  type="text"
                  value={form.accentColor}
                  onChange={(e) => updateField('accentColor', e.target.value)}
                  className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-150"
                  aria-label="Accent color hex"
                />
              </div>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground">Links</h2>
              <span className="text-xs text-text-muted">
                {form.links.length} {form.links.length === 1 ? 'link' : 'links'}
              </span>
            </div>

            {form.links.length === 0 ? (
              <p className="text-sm text-text-muted">
                No links yet. Add one to populate your public page.
              </p>
            ) : (
              <div className="space-y-3">
                {form.links.map((link, index) => (
                  <LinkRow
                    key={link.linkKey}
                    link={link}
                    index={index}
                    total={form.links.length}
                    onChange={(patch) => updateLink(index, patch)}
                    onMoveUp={() => moveLink(index, -1)}
                    onMoveDown={() => moveLink(index, 1)}
                    onRemove={() => removeLink(index)}
                  />
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={addLink}
              className="w-full flex items-center justify-center gap-1.5 border border-dashed border-border rounded-lg px-3 py-2 text-sm text-text-muted hover:text-foreground hover:border-accent/50 hover:bg-muted transition-colors duration-150 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Link
            </button>
          </div>

          {mode === 'edit' && page && (
            <VersionsPanel
              loader={() => listPageVersions(page.pageId)}
              restore={(n) => restorePageVersion(page.pageId, n)}
              reloadKey={page.currentVersion}
              onRestored={async () => {
                const refreshed = await getPage(page.pageId);
                setPage(refreshed);
                setForm(formFromPage(refreshed));
              }}
            />
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this Links Page?"
        description={
          <span>
            This will permanently remove <strong className="text-foreground">{form.displayName}</strong> and its public URL <code className="text-foreground">/p/{form.slug}</code>. QR codes pointing to this page will stop working.
          </span>
        }
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => !deleting && setConfirmDelete(false)}
      />
    </div>
  );
}
