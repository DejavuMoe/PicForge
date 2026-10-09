import { useTranslation } from 'react-i18next';

/** Shared status line: authorship, local-processing state and sponsorship. */
export function SiteFooter() {
  const { t } = useTranslation();
  return (
    <footer className="pf-site-footer">
      <a className="pf-copyright" href="https://blog.dejavu.moe/" target="_blank" rel="noreferrer">
        © 2026 DejavuMoe
      </a>
      <span className="pf-footer-status">
        <span className="pf-footer-dot" aria-hidden />
        {t('workbench.local')}
        <span className="pf-footer-version">v{__APP_VERSION__}</span>
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
