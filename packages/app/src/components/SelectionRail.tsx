import type { HTMLAttributes } from 'react';

/** CSS owns selection geometry; no measurement or animation worker is needed. */
export function SelectionRail({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`pf-selection-rail ${className}`} {...props} />;
}
