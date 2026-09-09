import type { InputHTMLAttributes } from 'react';

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'min' | 'max'
> & {
  value: number;
  min: number;
  max: number;
  onValueChange: (value: number) => void;
};

/** Allow normal typing, including an empty draft. Commit once on blur or Enter. */
export function NumberControl({ value, min, max, onValueChange, ...props }: Props) {
  return (
    <input
      {...props}
      key={value}
      type="number"
      min={min}
      max={max}
      defaultValue={value}
      onBlur={(event) => {
        const draft = event.currentTarget.valueAsNumber;
        const next = Number.isFinite(draft)
          ? Math.max(min, Math.min(max, Math.round(draft)))
          : value;
        event.currentTarget.value = String(next);
        if (next !== value) onValueChange(next);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') event.currentTarget.value = String(value);
        if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
      }}
    />
  );
}
