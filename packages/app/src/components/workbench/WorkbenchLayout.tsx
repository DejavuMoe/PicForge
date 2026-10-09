import type { ReactNode } from 'react';
import { cx } from '../ui/cx';

/** Shared visual structure only: processing and state ownership stay in each tool. */
export function WorkbenchLayout({
  queue,
  viewer,
  inspector,
  batch,
  mobileView,
  hasFiles,
}: {
  queue: ReactNode;
  viewer: ReactNode;
  inspector: ReactNode;
  /** Batch ledger under the queue; sticky at the bottom on phones. */
  batch?: ReactNode;
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
      {/* Media is judged on the neutral stage; the empty drop sheet stays on the sheet. */}
      <section
        className={cx('pf-preview-panel', hasFiles && 'pf-stage-scope')}
        data-testid="preview-panel"
      >
        {viewer}
      </section>
      {inspector}
      {batch && <div className="pf-batch-slot">{batch}</div>}
    </main>
  );
}
