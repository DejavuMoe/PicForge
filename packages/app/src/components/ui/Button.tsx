import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cx } from './cx';

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  /** One primary action per surface; secondary is the default. */
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  /** Leading icon, decorative. */
  icon?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  block = false,
  icon,
  className,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'pf-button',
        variant !== 'secondary' && `is-${variant}`,
        size !== 'md' && `is-${size}`,
        block && 'is-block',
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

/** Inline action set in running text or beside a status. */
export function TextButton({
  className,
  type = 'button',
  ...props
}: ComponentPropsWithRef<'button'>) {
  return <button type={type} className={cx('pf-text-button', className)} {...props} />;
}
