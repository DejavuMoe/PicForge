import { useLayoutEffect, useRef } from 'react';

/**
 * Pins a strip to the rendered picture rather than its pane: the frame receives the
 * picture's fitted width and bottom edge as `--pf-photo-width` and `--pf-photo-bottom`.
 */
export function useFittedStrip(active: boolean) {
  const frame = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => {
    const element = frame.current;
    const picture = image.current;
    if (!active || !element || !picture) return;
    const fit = () => {
      const bounds = picture.getBoundingClientRect();
      if (!bounds.width || !picture.naturalWidth) return;
      element.style.setProperty('--pf-photo-width', `${bounds.width}px`);
      element.style.setProperty(
        '--pf-photo-bottom',
        `${bounds.bottom - element.getBoundingClientRect().top}px`,
      );
    };
    const observer = new ResizeObserver(fit);
    observer.observe(picture);
    observer.observe(element);
    fit();
    return () => observer.disconnect();
  }, [active]);
  return { frame, image };
}
