import { FiArrowRight } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import type { ToolId } from '../types';

const TOOLS = [
  { id: 'compression', formats: 'JPG · PNG · WebP · AVIF' },
  { id: 'android', formats: 'JPG → JPG + MP4' },
  { id: 'ios', formats: 'HEIC + MOV → JPG + MP4' },
] as const;

/**
 * The three tools as an indexed contents list. Every row shares one column template, so
 * numbers, titles, formats and arrows align in every locale.
 */
export function ToolIndex({ onSelect }: { onSelect: (tool: ToolId) => void }) {
  const { t } = useTranslation();
  return (
    <nav className="pf-entry-tools" aria-label={t('workbench.tools')}>
      {TOOLS.map(({ id, formats }, index) => {
        const url = new URL(window.location.href);
        url.searchParams.set('tool', id);
        return (
          <a
            key={id}
            className="pf-entry-tool"
            href={`${url.pathname}${url.search}${url.hash}`}
            onClick={(event) => {
              if (
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              event.preventDefault();
              onSelect(id);
            }}
          >
            <span className="pf-entry-number" aria-hidden>
              0{index + 1}
            </span>
            <strong>{t(`motion.${id}`)}</strong>
            <span className="pf-entry-description">{t(`entry.${id}`)}</span>
            <span className="pf-entry-formats">{formats}</span>
            <FiArrowRight className="pf-entry-arrow" aria-hidden />
          </a>
        );
      })}
    </nav>
  );
}
