import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cx } from './cx';

export interface IconButtonProps extends Omit<
  ComponentPropsWithRef<'button'>,
  'children' | 'aria-label'
> {
  /** Accessible name; also shown as the themed hint unless `hint` is false. */
  label: string;
  icon: ReactNode;
  size?: 'sm' | 'md';
  hint?: boolean;
}

export function IconButton({
  label,
  icon,
  size = 'md',
  hint = true,
  className,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cx('pf-icon-button', size === 'sm' && 'is-sm', className)}
      aria-label={label}
      data-tooltip={hint ? label : undefined}
      {...props}
    >
      {icon}
    </button>
  );
}
