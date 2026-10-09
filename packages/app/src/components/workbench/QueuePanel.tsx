import type { ReactNode } from 'react';
import { FiPlus, FiTrash2 } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';

/** Queue column: title and count, add/clear actions, then the rows. */
export function QueuePanel({
  title,
  count,
  onAdd,
  addDisabled,
  clearLabel,
  onClear,
  clearDisabled,
  notice,
  testId,
  children,
}: {
  title: string;
  count: number;
  onAdd: () => void;
  addDisabled?: boolean;
  clearLabel: string;
  onClear: () => void;
  clearDisabled?: boolean;
  notice?: ReactNode;
  testId?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="pf-file-list" data-testid={testId}>
      <header className="pf-file-list-header">
        <h2>
          {title} <span className="pf-queue-count">{count || ''}</span>
        </h2>
        <Button
          variant="quiet"
          size="sm"
          className="pf-add-files"
          icon={<FiPlus aria-hidden />}
          disabled={addDisabled}
          onClick={onAdd}
        >
          {t('workbench.add')}
        </Button>
        {count > 0 && (
          <IconButton
            size="sm"
            label={clearLabel}
            icon={<FiTrash2 aria-hidden />}
            disabled={clearDisabled}
            onClick={(event) => {
              event.currentTarget.focus();
              onClear();
            }}
          />
        )}
      </header>
      {notice}
      {count > 0 ? (
        <div className="pf-file-list-scroll">{children}</div>
      ) : (
        <div className="pf-queue-empty">
          <span className="pf-queue-empty-rule" aria-hidden />
          {t('workbench.noFiles')}
        </div>
      )}
    </div>
  );
}
