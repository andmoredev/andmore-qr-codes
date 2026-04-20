import { Construction } from 'lucide-react';

export function PublicPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 text-center">
      <Construction className="w-10 h-10 text-accent mb-4" strokeWidth={1.5} />
      <h1 className="text-xl font-semibold text-foreground mb-2">Public Links Page</h1>
      <p className="text-sm text-text-muted max-w-md">
        Publicly rendered Links Page view. A feature PR fetches the page via <code className="text-foreground">/public/pages/:slug</code> and renders the link list.
      </p>
    </div>
  );
}
