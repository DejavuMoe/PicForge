import { useLayoutEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';
import { OpticalLayer } from './OpticalLayer';

export function SelectionRail({
  as: Tag = 'div',
  activeKey,
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'nav';
  activeKey: string;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement & HTMLElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => {
      const selected = element.querySelector<HTMLElement>(
        'button[aria-current="page"], button[aria-pressed="true"]',
      );
      if (!selected || !thumb.current) return;
      thumb.current.style.width = `${selected.offsetWidth}px`;
      thumb.current.style.transform = `translateX(${selected.offsetLeft}px)`;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.querySelectorAll('button').forEach((button) => observer.observe(button));
    return () => observer.disconnect();
  }, [activeKey]);
  return (
    <Tag ref={root} className={`pf-selection-rail ${className}`} {...props}>
      <span className="pf-selection-thumb" ref={thumb} aria-hidden="true">
        <OpticalLayer />
      </span>
      {children}
    </Tag>
  );
}
