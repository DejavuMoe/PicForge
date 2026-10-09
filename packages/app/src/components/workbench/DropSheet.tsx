import { useState, type DragEvent, type ReactNode } from 'react';
import { FiLock, FiPlus } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { cx } from '../ui/cx';

/**
 * Empty stage: one large target that accepts drops, clicks and Enter/Space. The call to
 * action is drawn inside the target, so there is no nested control.
 */
export function DropSheet({
  index,
  tool,
  title,
  activeTitle,
  hint,
  formats,
  label,
  onDrop,
  onBrowse,
  testId,
  children,
}: {
  index: string;
  tool: string;
  title: string;
  /** Headline while files are dragged over the sheet. */
  activeTitle?: string;
  hint: string;
  formats: ReadonlyArray<string>;
  label: string;
  /** Called synchronously within the drop event; entries must be read before it returns. */
  onDrop: (data: DataTransfer) => void;
  onBrowse: () => void;
  testId?: string;
  /** Inputs and transient notices owned by the tool. */
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const over = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(true);
  };
  return (
    <section
      className={cx('pf-drop-zone', dragging && 'is-dragging')}
      data-testid={testId}
      onDragEnter={over}
      onDragOver={over}
      onDragLeave={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragging(false);
        onDrop(event.dataTransfer);
      }}
    >
      <div
        className="pf-drop-surface"
        role="button"
        tabIndex={0}
        aria-label={label}
        onClick={onBrowse}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onBrowse();
          }
        }}
      >
        <div className="pf-drop-content">
          <p className="pf-eyebrow">
            <span className="pf-mono">{index}</span>
            {tool}
          </p>
          <h2 className="pf-drop-main-text">{dragging && activeTitle ? activeTitle : title}</h2>
          <p className="pf-drop-secondary-text">{hint}</p>
          <div className="pf-drop-actions">
            <span className="pf-drop-cta" aria-hidden>
              <FiPlus />
              {t('motion.select')}
            </span>
            <span className="pf-tag-list pf-drop-format-hint">
              {formats.map((format) => (
                <span className="pf-tag" key={format}>
                  {format}
                </span>
              ))}
            </span>
          </div>
        </div>
        <p className="pf-drop-privacy">
          <FiLock aria-hidden />
          {t('entry.privacy')}
        </p>
      </div>
      {children}
    </section>
  );
}
