import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SERVICE_WORKER_UPDATE_EVENT, applyServiceWorkerUpdate } from '../../registerServiceWorker';
import { Button } from '../ui/Button';

/** A waiting service worker never reloads on its own; the user chooses when. */
export function UpdateToast() {
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const show = () => setReady(true);
    window.addEventListener(SERVICE_WORKER_UPDATE_EVENT, show);
    return () => window.removeEventListener(SERVICE_WORKER_UPDATE_EVENT, show);
  }, []);
  if (!ready) return null;
  return (
    <div className="pf-update-toast pf-stage-scope" role="status">
      <span>{t('pwa.updateReady')}</span>
      <Button
        variant="primary"
        size="sm"
        className="pf-update-button"
        onClick={applyServiceWorkerUpdate}
      >
        {t('pwa.refresh')}
      </Button>
    </div>
  );
}
