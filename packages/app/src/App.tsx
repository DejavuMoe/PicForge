import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from './components/Header';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Landing } from './landing/Landing';
import { SERVICE_WORKER_UPDATE_EVENT } from './registerServiceWorker';
import type { ToolId } from './types';
import CompressionWorkspace from './CompressionWorkspace';

const MotionWorkspace = lazy(() => import('./motion/MotionWorkspace'));

export default function App() {
  const { t } = useTranslation();
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    const ready = () => setUpdateReady(true);
    window.addEventListener(SERVICE_WORKER_UPDATE_EVENT, ready);
    return () => window.removeEventListener(SERVICE_WORKER_UPDATE_EVENT, ready);
  }, []);

  const [tool, setTool] = useState<ToolId>(() => {
    if (typeof window !== 'undefined') {
      const param = new URLSearchParams(window.location.search).get('tool');
      if (param === 'compression' || param === 'android' || param === 'ios') {
        return param;
      }
    }
    return 'home';
  });
  // Tool workspaces stay mounted once visited so queues survive navigation.
  const [visited, setVisited] = useState<ToolId[]>(() => {
    if (typeof window !== 'undefined') {
      const param = new URLSearchParams(window.location.search).get('tool');
      if (param === 'compression' || param === 'android' || param === 'ios') {
        return [param];
      }
    }
    return [];
  });

  const openTool = useCallback((value: ToolId) => {
    setTool(value);
    if (value !== 'home') {
      setVisited((previous) => (previous.includes(value) ? previous : [...previous, value]));
    }
  }, []);

  const goHome = useCallback(() => setTool('home'), []);

  return (
    <ErrorBoundary>
      <div className="pf-toolbox" data-active-tool={tool}>
        <Header onHome={goHome} />

        {tool === 'home' && <Landing onSelect={openTool} />}

        {visited.map((value) => (
          <div className="pf-tool-panel" key={value} hidden={tool !== value}>
            <Suspense fallback={<p role="status">{t('motion.loading')}</p>}>
              {value === 'compression' ? (
                <CompressionWorkspace active={tool === value} />
              ) : (
                <MotionWorkspace android={value === 'android'} />
              )}
            </Suspense>
          </div>
        ))}

        {updateReady && (
          <div className="pf-update-toast" role="status">
            <span>{t('pwa.updateReady')}</span>
            <button className="pf-update-button" onClick={() => window.location.reload()}>
              {t('pwa.refresh')}
            </button>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
