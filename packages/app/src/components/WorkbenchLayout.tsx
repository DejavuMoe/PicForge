import type { ReactNode } from 'react';

/** Shared visual structure only: processing/state ownership stays in each tool. */
export function WorkbenchLayout({
  queue,
  viewer,
  inspector,
  mobileView,
  hasFiles,
}: {
  queue: ReactNode;
  viewer: ReactNode;
  inspector: ReactNode;
  mobileView: 'list' | 'preview';
  hasFiles: boolean;
}) {
  return (
    <main
      className="pf-workbench"
      data-mobile-view={mobileView}
      data-has-files={hasFiles}
      data-testid="app-main"
    >
      <section className="pf-file-list-panel" data-testid="file-list-panel">
        {queue}
      </section>
      <section className="pf-preview-panel" data-testid="preview-panel">
        {viewer}
      </section>
      {inspector}
    </main>
  );
}

export function Inspector({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <aside className="pf-inspector">
      <details className="pf-inspector-disclosure" open>
        <summary>
          <h2>{title}</h2>
          <span className="pf-disclosure-mark" aria-hidden="true" />
        </summary>
        <div className="pf-inspector-body">{children}</div>
      </details>
      {footer && <div className="pf-inspector-footer">{footer}</div>}
    </aside>
  );
}

export function SwitchControl({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      className={`pf-switch${checked ? ' is-checked' : ''}`}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
    >
      <span className="pf-switch-thumb" aria-hidden="true" />
    </button>
  );
}
