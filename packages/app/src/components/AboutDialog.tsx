import { OpticalLayer } from './OpticalLayer';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiArrowLeft, FiX } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';

const COMPONENTS = [
  {
    name: 'PicForge',
    license: 'MIT',
    source: 'https://github.com/DejavuMoe/PicForge',
  },
  {
    name: 'Hyalite',
    license: 'MIT',
    file: 'Hyalite-MIT.txt',
    source: 'https://github.com/VII-Cae/hyalite--liquid-glass',
  },
  {
    name: 'FFmpeg / x264',
    license: 'GPL-2.0-or-later',
    file: 'FFmpeg-GPL-2.0.txt',
    source: 'https://github.com/ffmpegwasm/ffmpeg.wasm',
  },
  {
    name: 'libheif',
    license: 'LGPL-3.0',
    file: 'libheif-LGPL-3.0.txt',
    source: 'https://github.com/strukturag/libheif',
  },
] as const;

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [document, setDocument] = useState<{ title: string; text: string } | null>(null);
  const request = useRef<AbortController | null>(null);
  const exitAnimation = useRef<Animation | null>(null);
  const closing = useRef(false);
  const dismiss = () => {
    if (closing.current) return;
    closing.current = true;
    if (!dialog.current || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose();
      return;
    }
    exitAnimation.current = dialog.current.animate(
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: 'translateY(8px) scale(.98)' },
      ],
      { duration: 140, easing: 'ease-in', fill: 'forwards' },
    );
    void exitAnimation.current.finished.then(onClose, () => undefined);
  };
  useLayoutEffect(() => {
    const previous = window.document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    close.current?.focus();
    return () => {
      request.current?.abort();
      exitAnimation.current?.cancel();
      element.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  const readNotice = async (file: string, title: string) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setDocument({ title, text: t('about.loading') });
    try {
      const response = await fetch(`/licenses/${file}`, { signal: controller.signal });
      if (!response.ok) throw new Error('Notice unavailable');
      const text = await response.text();
      if (!controller.signal.aborted) setDocument({ title, text });
    } catch {
      if (!controller.signal.aborted) setDocument({ title, text: t('about.unavailable') });
    }
  };
  return createPortal(
    <dialog
      ref={dialog}
      className="pf-about-dialog"
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            dismiss();
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], [tabindex="0"]',
          ),
        ];
        const first = controls[0],
          last = controls[controls.length - 1];
        if (event.shiftKey && window.document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && window.document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <OpticalLayer />
      <div className="pf-about-heading">
        <div>
          <h2 id={`${id}-title`}>{t('workbench.about')}</h2>
          <span>PicForge {__APP_VERSION__}</span>
        </div>
        <button
          ref={close}
          className="pf-icon-button"
          aria-label={t('about.close')}
          onClick={dismiss}
        >
          <FiX aria-hidden />
        </button>
      </div>
      {document ? (
        <div className="pf-license-document">
          <button
            className="pf-text-button"
            onClick={() => {
              request.current?.abort();
              setDocument(null);
            }}
          >
            <FiArrowLeft aria-hidden />
            {t('about.back')}
          </button>
          <h3>{document.title}</h3>
          <pre tabIndex={0} aria-label={document.title}>
            {document.text}
          </pre>
        </div>
      ) : (
        <>
          <p className="pf-about-description">{t('about.description')}</p>
          <div className="pf-about-links">
            <a href="https://github.com/DejavuMoe/PicForge" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href="https://blog.dejavu.moe/" target="_blank" rel="noreferrer">
              DejavuMoe
            </a>
            <a href="https://sa.net/?ref=https://picforge.de" target="_blank" rel="noreferrer">
              Riven Cloud
            </a>
          </div>
          <h3>{t('about.openSource')}</h3>
          <p className="pf-about-caption">{t('about.licenseHint')}</p>
          <ul className="pf-license-list">
            {COMPONENTS.map((item) => (
              <li key={item.name}>
                <div>
                  <a href={item.source} target="_blank" rel="noreferrer">
                    {item.name}
                  </a>
                  <span>{item.license}</span>
                </div>
                {item.name === 'PicForge' ? (
                  <a
                    className="pf-text-button"
                    href="https://github.com/DejavuMoe/PicForge/blob/main/LICENSE"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('about.readLicense')}
                  </a>
                ) : (
                  <button
                    className="pf-text-button"
                    onClick={() => void readNotice(item.file, item.name)}
                  >
                    {t('about.readLicense')}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button
            className="pf-text-button pf-notices-link"
            onClick={() => void readNotice('NOTICE.txt', t('about.allNotices'))}
          >
            {t('about.allNotices')}
          </button>
        </>
      )}
    </dialog>,
    window.document.body,
  );
}
