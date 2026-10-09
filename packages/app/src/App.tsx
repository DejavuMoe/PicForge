import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from './components/shell/ErrorBoundary';
import { Header } from './components/shell/Header';
import { SiteFooter } from './components/shell/SiteFooter';
import { UpdateToast } from './components/shell/UpdateToast';
import { TooltipLayer } from './components/ui/TooltipLayer';
import type { ToolId } from './types';

function toolFromLocation(): ToolId {
  const value = new URLSearchParams(window.location.search).get('tool');
  return value === 'compression' || value === 'android' || value === 'ios' ? value : 'home';
}

const MotionWorkspace = lazy(() => import('./workspaces/motion/MotionWorkspace'));
const CompressionWorkspace = lazy(() => import('./workspaces/compression/CompressionWorkspace'));
const Landing = lazy(() => import('./landing/Landing'));

const NAVIGATION_KEYS = new Set([
  'Tab',
  'Enter',
  ' ',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

function ToolLoading() {
  const { t } = useTranslation();
  return (
    <div className="pf-tool-loading" role="status">
      <span className="pf-tool-loading-bar" aria-hidden />
      {t('motion.loading')}
    </div>
  );
}

export default function App() {
  const { t } = useTranslation();
  // Focus frames follow the input method: keyboard navigation shows them, pointers do not.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.pfInput = 'pointer';
    const pointer = () => {
      root.dataset.pfInput = 'pointer';
    };
    const keyboard = (event: KeyboardEvent) => {
      if (NAVIGATION_KEYS.has(event.key)) root.dataset.pfInput = 'keyboard';
    };
    document.addEventListener('pointerdown', pointer, true);
    document.addEventListener('keydown', keyboard, true);
    return () => {
      document.removeEventListener('pointerdown', pointer, true);
      document.removeEventListener('keydown', keyboard, true);
    };
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
      tool === 'home' ? `PicForge · ${t('entry.title')}` : `${t(`motion.${tool}`)} · PicForge`;
  }, [tool, t]);

  return (
    <ErrorBoundary>
      <div className="pf-toolbox" data-active-tool={tool}>
        <a className="pf-skip-link" href="#pf-main">
          {t('workbench.skipToContent')}
        </a>
        <Header tool={tool} onHome={goHome} onSelect={openTool} />

        {tool === 'home' && (
          <Suspense fallback={<ToolLoading />}>
            <Landing onSelect={openTool} />
          </Suspense>
        )}

        {tool !== 'home' && (
          <h1 id="pf-main" className="pf-sr-only" tabIndex={-1}>
            {t(`motion.${tool}`)}
          </h1>
        )}

        {visited.map((value) => (
          <div className="pf-tool-panel" key={value} hidden={tool !== value}>
            <Suspense fallback={<ToolLoading />}>
              {value === 'compression' ? (
                <CompressionWorkspace active={tool === value} />
              ) : (
                <MotionWorkspace android={value === 'android'} active={tool === value} />
              )}
            </Suspense>
          </div>
        ))}

        <SiteFooter />
        <TooltipLayer />
        <UpdateToast />
      </div>
    </ErrorBoundary>
  );
}
