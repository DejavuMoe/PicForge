import type { ReactNode } from 'react';

interface Props {
  value: string | number;
  onValueChange: (value: string) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
  'aria-label'?: string;
}

/** Native keyboard navigation, touch picker and popup positioning in every browser. */
export function SelectControl({ onValueChange, className = '', ...props }: Props) {
  return (
    <select
      {...props}
      className={`pf-select ${className}`}
      onChange={(event) => onValueChange(event.target.value)}
    />
  );
}
