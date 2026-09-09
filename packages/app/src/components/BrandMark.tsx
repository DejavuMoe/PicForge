import { useId } from 'react';

export function BrandMark() {
  const id = useId();
  return (
    <svg viewBox="0 0 40 48" className="pf-brand-mark" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="var(--pf-brand-light, #62a982)" />
          <stop offset=".55" stopColor="var(--pf-brand-mid, #24694b)" />
          <stop offset="1" stopColor="var(--pf-brand-deep, #12432f)" />
        </linearGradient>
      </defs>
      <path
        d="M12 3h13c9 0 14 5 14 13s-6 13-15 13h-9l-3 13c-.7 3-3.4 4.5-6.4 3.8C3.7 45 2.3 43 3 40L10 10c.8-3.4 1.2-5.4 2-7Z"
        fill={`url(#${id})`}
      />
      <path
        d="M12 3h12c3.5 0 6.6.8 9 2.5-5.9-.7-8.3 3-9.6 8.1L18 36H6L12 3Z"
        fill="var(--pf-brand-fold, #154d36)"
        opacity=".7"
      />
      <path
        d="M10 3h14c3 0 5 2.4 5 5s-2 5-5 5H10C6 13 4 11 4 8s2-5 6-5Z"
        fill="var(--pf-brand-cap, #3b8962)"
      />
      <path d="M19 13h5c3 0 5 1 5 4s-2 5-6 5h-6l2-9Z" fill="var(--pf-brand-cutout, #edf3ef)" />
    </svg>
  );
}
