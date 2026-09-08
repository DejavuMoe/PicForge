import { createContext, useContext, useEffect, useRef } from 'react';
import type { HyaliteAPI } from '../vendor/hyalite';

export const OpticalScope = createContext(true);
let enginePromise: Promise<HyaliteAPI> | undefined;
const loadOptics = () =>
  (enginePromise ??= import('../vendor/hyalite.js').then(() => window.Hyalite));

/** Refracts the backing pixels; rendered controls and media content never pass through the filter. */
export function OpticalLayer({ strong = false }: { strong?: boolean }) {
  const element = useRef<HTMLSpanElement>(null);
  const active = useContext(OpticalScope);
  useEffect(() => {
    const target = element.current;
    if (!target || !active) return;
    const transparency = matchMedia('(prefers-reduced-transparency: reduce)');
    const contrast = matchMedia('(forced-colors: active)');
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let disposed = false;
    let engine: HyaliteAPI | undefined;
    const attach = async () => {
      if (transparency.matches || contrast.matches || document.hidden) {
        engine?.detach(target);
        target.dataset.optics = 'fallback';
        return;
      }
      try {
        engine = await loadOptics();
        if (disposed || transparency.matches || contrast.matches || document.hidden) return;
        engine.detach(target);
        engine.attach(target, {
          bevel: strong ? 13 : 10,
          thickness: strong ? 9 : 6,
          blur: strong ? 0.2 : 0.6,
          dispersion: 0,
          rim: strong ? 0.85 : 0.42,
          smooth: 1,
          materialize: motion.matches ? 0 : 220,
          settle: 160,
        });
        target.dataset.optics = engine.supported() ? 'refractive' : 'fallback';
      } catch {
        target.dataset.optics = 'fallback';
      }
    };
    const update = () => void attach();
    update();
    transparency.addEventListener('change', update);
    contrast.addEventListener('change', update);
    motion.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      disposed = true;
      engine?.detach(target);
      transparency.removeEventListener('change', update);
      contrast.removeEventListener('change', update);
      motion.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [active, strong]);
  return <span ref={element} className="pf-optical-layer" aria-hidden="true" />;
}
