import type { ReactNode } from "react";

/** One h1 per page, with an optional eyebrow, description and actions (heading-hierarchy rule). */
export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="grid gap-1">
        {eyebrow && <p className="text-xs font-semibold tracking-wider text-brand-text uppercase">{eyebrow}</p>}
        <h1 className="text-3xl sm:text-4xl">{title}</h1>
        {description && <p className="max-w-prose text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
