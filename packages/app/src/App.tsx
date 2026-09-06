import { lazy, Suspense, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from './components/Header';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SERVICE_WORKER_UPDATE_EVENT } from './registerServiceWorker';
import CompressionWorkspace from './CompressionWorkspace';
const MotionWorkspace = lazy(() => import('./motion/MotionWorkspace'));
type Tool = 'compression' | 'android' | 'ios';
export default function App() {
  const { t } = useTranslation();
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => {
    const ready = () => setUpdateReady(true);
    window.addEventListener(SERVICE_WORKER_UPDATE_EVENT, ready);
    return () => window.removeEventListener(SERVICE_WORKER_UPDATE_EVENT, ready);
  }, []);
  const [tool, setTool] = useState<Tool>('compression');
  const [visited, setVisited] = useState<Tool[]>(['compression']);
  return (
    <ErrorBoundary>
      <div className="pf-toolbox">
        <Header />
        <nav className="pf-tool-nav" aria-label={t('motion.tools')}>
          {(['compression', 'android', 'ios'] as const).map((value) => (
            <button
              key={value}
              aria-current={tool === value ? 'page' : undefined}
              onClick={() => {
                setTool(value);
                setVisited((previous) =>
                  previous.includes(value) ? previous : [...previous, value],
                );
              }}
            >
              {t(`motion.${value}`)}
            </button>
          ))}
        </nav>
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
