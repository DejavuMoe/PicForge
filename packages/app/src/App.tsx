import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from './components/Header';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SERVICE_WORKER_UPDATE_EVENT } from './registerServiceWorker';
import type { ToolId } from './types';
import CompressionWorkspace from './CompressionWorkspace';
import Landing from './landing/Landing';
import { OpticalScope } from './components/OpticalLayer';

function toolFromLocation(): ToolId {
  const value = new URLSearchParams(window.location.search).get('tool');
  return value === 'compression' || value === 'android' || value === 'ios' ? value : 'home';
}

const MotionWorkspace = lazy(() => import('./motion/MotionWorkspace'));

export default function App() {
  const { t } = useTranslation();
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    const ready = () => setUpdateReady(true);
    window.addEventListener(SERVICE_WORKER_UPDATE_EVENT, ready);
    return () => window.removeEventListener(SERVICE_WORKER_UPDATE_EVENT, ready);
  }, []);

  const [tool, setTool] = useState<ToolId>(toolFromLocation);
  // Tool workspaces stay mounted once visited so queues survive home/back navigation.
  const [visited, setVisited] = useState<ToolId[]>(() => {
    const initial = toolFromLocation();
    return initial === 'home' ? [] : [initial];
  });
  const selectTool = useCallback((value: ToolId) => {
    setTool(value);
    if (value !== 'home')
      setVisited((previous) => (previous.includes(value) ? previous : [...previous, value]));
  }, []);
  useEffect(() => {
    const restore = () => selectTool(toolFromLocation());
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [selectTool]);

  const openTool = useCallback(
    (value: ToolId) => {
      if (value === tool) return;
      const url = new URL(window.location.href);
      if (value === 'home') url.searchParams.delete('tool');
      else url.searchParams.set('tool', value);
      window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`);
      selectTool(value);
    },
    [selectTool, tool],
  );
  const goHome = useCallback(() => openTool('home'), [openTool]);

  return (
    <ErrorBoundary>
      <div className="pf-toolbox" data-active-tool={tool}>
        <Header onHome={goHome} tool={tool} onSelect={openTool} />

        {tool === 'home' && <Landing onSelect={openTool} />}

        {visited.map((value) => (
          <div className="pf-tool-panel" key={value} hidden={tool !== value}>
            <OpticalScope value={tool === value}>
              <Suspense fallback={<p role="status">{t('motion.loading')}</p>}>
                {value === 'compression' ? (
                  <CompressionWorkspace active={tool === value} />
                ) : (
                  <MotionWorkspace android={value === 'android'} active={tool === value} />
                )}
              </Suspense>
            </OpticalScope>
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
