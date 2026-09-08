import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
const AboutDialog = lazy(() =>
  import('./AboutDialog').then((module) => ({ default: module.AboutDialog })),
);

export function ProjectInfo({ variant = 'workbench' }: { variant?: 'landing' | 'workbench' }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className={`pf-project-info pf-project-info--${variant}`}>
      <div className="pf-project-links">
        <a href="https://blog.dejavu.moe/" target="_blank" rel="noreferrer">
          © 2026 DejavuMoe
        </a>
        {variant === 'landing' && (
          <a href="https://github.com/DejavuMoe/PicForge" target="_blank" rel="noreferrer">
            GitHub
          </a>
        )}
        <button
          onClick={(event) => {
            event.currentTarget.focus();
            setOpen(true);
          }}
        >
          {t('workbench.about')}
        </button>
      </div>
      {variant === 'landing' && (
        <a
          className="pf-project-sponsor"
          href="https://sa.net/?ref=https://picforge.de"
          target="_blank"
          rel="noreferrer"
        >
          {t('workbench.sponsor')}
        </a>
      )}
      {open && (
        <Suspense fallback={null}>
          <AboutDialog onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
