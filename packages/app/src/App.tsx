import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from './components/Header';
import { FiLock } from 'react-icons/fi';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SERVICE_WORKER_UPDATE_EVENT } from './registerServiceWorker';
import type { ToolId } from './types';

function toolFromLocation(): ToolId {
  const value = new URLSearchParams(window.location.search).get('tool');
  return value === 'compression' || value === 'android' || value === 'ios' ? value : 'home';
}

const MotionWorkspace = lazy(() => import('./motion/MotionWorkspace'));
const CompressionWorkspace = lazy(() => import('./CompressionWorkspace'));
const Landing = lazy(() => import('./landing/Landing'));

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

  useEffect(() => {
    document.title =
      tool === 'home'
        ? 'PicForge — Your images, on your device'
        : `${t(`motion.${tool}`)} · PicForge`;
  }, [tool, t]);

  return (
    <ErrorBoundary>
      <div className="pf-toolbox" data-active-tool={tool}>
        <a className="pf-skip-link" href="#pf-main">
          {t('workbench.skipToContent')}
        </a>
        <Header onHome={goHome} tool={tool} onSelect={openTool} />

        {tool === 'home' && (
          <Suspense
            fallback={
              <div className="pf-tool-loading" role="status">
                {t('motion.loading')}
              </div>
            }
          >
            <Landing onSelect={openTool} />
          </Suspense>
        )}

        {tool !== 'home' && (
          <div className="pf-workspace-heading">
            <h1 id="pf-main" tabIndex={-1}>
              {t(`motion.${tool}`)}
            </h1>
            <p>{t(`entry.${tool}`)}</p>
            <span className="pf-workspace-local">
              <FiLock aria-hidden />
              {t('workbench.local')}
            </span>
          </div>
        )}

        {visited.map((value) => (
          <div className="pf-tool-panel" key={value} hidden={tool !== value}>
            <Suspense
              fallback={
                <div className="pf-tool-loading" role="status">
                  {t('motion.loading')}
                </div>
              }
            >
              {value === 'compression' ? (
                <CompressionWorkspace active={tool === value} />
              ) : (
                <MotionWorkspace android={value === 'android'} active={tool === value} />
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
