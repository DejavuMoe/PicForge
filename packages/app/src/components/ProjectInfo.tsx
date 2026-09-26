import { useTranslation } from 'react-i18next';

/** Shared status line: authorship, local-processing state and sponsorship. */
export function ProjectInfo() {
  const { t } = useTranslation();
  return (
    <footer className="pf-site-footer">
      <a className="pf-copyright" href="https://blog.dejavu.moe/" target="_blank" rel="noreferrer">
        © 2026 DejavuMoe
      </a>
      <span className="pf-footer-status">
        {t('workbench.local')} · v{__APP_VERSION__}
      </span>
      <a
        className="pf-project-sponsor"
        href="https://sa.net/?ref=https://picforge.de"
        target="_blank"
        rel="noreferrer"
      >
        {t('workbench.sponsor')}
      </a>
    </footer>
  );
}
