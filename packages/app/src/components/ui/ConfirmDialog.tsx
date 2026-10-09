import { useId, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { Button } from './Button';

/** Native modal supplies focus containment, Escape and background inertness. */
export function ConfirmDialog({
  title,
  body,
  onCancel,
  onConfirm,
  danger = false,
}: {
  title: string;
  body: string;
  onCancel: () => void;
  onConfirm: () => void;
  danger?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    cancel.current?.focus();
    return () => {
      element.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="pf-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = [
          ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
        ];
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id={`${id}-title`}>{title}</h2>
      <p id={`${id}-body`}>{body}</p>
      <div className="pf-dialog-actions">
        <Button ref={cancel} onClick={onCancel}>
          {t('actions.cancel')}
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
          {t('actions.confirm')}
        </Button>
      </div>
    </dialog>,
    document.body,
  );
}
