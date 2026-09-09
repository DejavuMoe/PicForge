import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Delegated, themed hints; never replace controls or intercept their pointer events. */
export function TooltipLayer() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState({ left: -10000, top: -10000 });
  const tooltip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let anchor: HTMLElement | null = null;
    const hide = () => {
      clearTimeout(timer);
      anchor = null;
      setTarget(null);
    };
    const show = (event: Event) => {
      if (event.type === 'pointerover' && !matchMedia('(hover: hover) and (pointer: fine)').matches)
        return;
      if (event.type === 'focusin' && document.documentElement.dataset.pfInput !== 'keyboard')
        return;
      const element =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-tooltip]')
          : null;
      if (element === anchor) return;
      hide();
      if (element) {
        anchor = element;
        timer = setTimeout(() => setTarget(element), event.type === 'focusin' ? 0 : 400);
      }
    };
    const leave = (event: Event) => {
      if (
        event instanceof MouseEvent &&
        event.relatedTarget instanceof Node &&
        anchor?.contains(event.relatedTarget)
      )
        return;
      hide();
    };
    document.addEventListener('pointerover', show);
    document.addEventListener('focusin', show);
    document.addEventListener('pointerout', leave);
    document.addEventListener('focusout', hide);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('keydown', hide);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerover', show);
      document.removeEventListener('focusin', show);
      document.removeEventListener('pointerout', leave);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('keydown', hide);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, []);
  useLayoutEffect(() => {
    if (!target || !tooltip.current || !target.isConnected) return;
    const anchor = target.getBoundingClientRect(),
      box = tooltip.current.getBoundingClientRect();
    setPosition({
      left: Math.max(
        12,
        Math.min(anchor.left + (anchor.width - box.width) / 2, innerWidth - box.width - 12),
      ),
      top:
        anchor.bottom + box.height + 8 < innerHeight
          ? anchor.bottom + 6
          : Math.max(8, anchor.top - box.height - 6),
    });
  }, [target]);
  return target
    ? createPortal(
        <div ref={tooltip} className="pf-tooltip" role="tooltip" style={position}>
          {target.dataset.tooltip}
        </div>,
        document.fullscreenElement ?? document.body,
      )
    : null;
}
