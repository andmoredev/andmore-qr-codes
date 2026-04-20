import { Construction } from 'lucide-react';

interface Props {
  title: string;
  hint?: string;
}

export function StubPage({ title, hint }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Construction className="w-10 h-10 text-accent mb-4" strokeWidth={1.5} />
      <h1 className="text-xl font-semibold text-foreground mb-2">{title}</h1>
      <p className="text-sm text-text-muted max-w-md">
        {hint ?? 'Scaffolded in the foundation PR. A feature PR will implement this view.'}
      </p>
    </div>
  );
}
