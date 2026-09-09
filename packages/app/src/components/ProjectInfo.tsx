import { useTranslation } from 'react-i18next';
export function ProjectInfo({ variant = 'workbench' }: { variant?: 'landing' | 'workbench' }) {
  const { t } = useTranslation();
  return (
    <div className={`pf-project-info pf-project-info--${variant}`}>
      <div className="pf-project-links">
        <a href="https://blog.dejavu.moe/" target="_blank" rel="noreferrer">
          © 2026 DejavuMoe
        </a>
        <a href="https://github.com/DejavuMoe/PicForge" target="_blank" rel="noreferrer">
          GitHub
        </a>
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
    </div>
  );
}
