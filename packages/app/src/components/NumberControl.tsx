import { useLayoutEffect, useRef, type InputHTMLAttributes } from 'react';

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'onKeyDown' | 'min' | 'max'
> & {
  value: number;
  min: number;
  max: number;
  onValueChange: (value: number) => void;
};

/** Allow normal typing, including an empty draft. Commit once on blur or Enter. */
export function NumberControl({ value, min, max, onValueChange, ...props }: Props) {
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (input.current) input.current.value = String(value);
  }, [value]);
  const commit = (element: HTMLInputElement) => {
    const draft = element.valueAsNumber;
    const next = Number.isFinite(draft) ? Math.max(min, Math.min(max, Math.round(draft))) : value;
    element.value = String(next);
    if (next !== value) onValueChange(next);
  };
  return (
    <input
      {...props}
      ref={input}
      type="number"
      min={min}
      max={max}
      defaultValue={value}
      onBlur={(event) => commit(event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit(event.currentTarget);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.currentTarget.value = String(value);
        }
      }}
    />
  );
}
