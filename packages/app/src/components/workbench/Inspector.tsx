import { useId, type ReactNode } from 'react';

/**
 * Settings column. The body scrolls under a fixed title; the footer holds what the
 * selected item produced. Body and footer reserve the same gutter so their edges align.
 */
export function Inspector({
  title,
  aside,
  children,
  footer,
}: {
  title: string;
  /** Short state beside the title, e.g. which settings apply. */
  aside?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const id = useId();
  return (
    <aside className="pf-inspector" aria-labelledby={id}>
      <header className="pf-inspector-head">
        <h2 id={id}>{title}</h2>
        {aside}
      </header>
      <div className="pf-inspector-body">{children}</div>
      {footer && <div className="pf-inspector-footer">{footer}</div>}
    </aside>
  );
}
