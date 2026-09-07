import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FiFilm, FiImage, FiShield, FiSmartphone } from 'react-icons/fi';
import type { ToolId } from '../types';

const icons = { compression: FiImage, android: FiSmartphone, ios: FiFilm };

export function ToolHeading({
  tool,
  children,
}: {
  tool: Exclude<ToolId, 'home'>;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const Icon = icons[tool];
  return (
    <header className="pf-tool-topbar">
      <div className="pf-tool-heading">
        <span className="pf-tool-heading-icon" aria-hidden="true">
          <Icon />
        </span>
        <div className="pf-tool-title">
          <h1>{t(`motion.${tool}`)}</h1>
          <p>{t(`landing.cards.${tool}.body`)}</p>
        </div>
      </div>
      {children || (
        <span className="pf-tool-local">
          <FiShield aria-hidden="true" />
          {t('landing.features.local.title')}
        </span>
      )}
    </header>
  );
}
