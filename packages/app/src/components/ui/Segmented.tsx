import { useRef, type CSSProperties, type ReactNode } from 'react';
import { cx } from './cx';

export interface SegmentOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

/** Equal keys on a recessed track; a raised key slides to the current choice. */
function trackStyle(index: number, count: number) {
  return { '--pf-seg-index': index, '--pf-seg-count': count } as CSSProperties;
}

/** Pressed-state group: a scope or mode switch whose keys act immediately. */
export function Segmented({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<SegmentOption>;
  onChange: (value: string) => void;
  className?: string;
}) {
  const index = options.findIndex((option) => option.value === value);
  return (
    <div
      className={cx('pf-segmented', className)}
      role="group"
      aria-label={label}
      data-empty={index < 0 || undefined}
      style={trackStyle(Math.max(0, index), options.length)}
    >
      <span className="pf-segmented-indicator" aria-hidden />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Single-choice rail with roving focus: arrows move and select, like native radios. */
export function RadioRail({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<SegmentOption>;
  onChange: (value: string) => void;
  className?: string;
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const current = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const move = (index: number) => {
    const next = (index + options.length) % options.length;
    onChange(options[next].value);
    buttons.current[next]?.focus();
  };
  return (
    <div
      className={cx('pf-segmented', 'pf-radio-rail', className)}
      role="radiogroup"
      aria-label={label}
      style={trackStyle(current, options.length)}
    >
      <span className="pf-segmented-indicator" aria-hidden />
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={(element) => {
            buttons.current[index] = element;
          }}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={index === current ? 0 : -1}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            const steps: Record<string, number> = {
              ArrowRight: 1,
              ArrowDown: 1,
              ArrowLeft: -1,
              ArrowUp: -1,
            };
            if (steps[event.key]) move(index + steps[event.key]);
            else if (event.key === 'Home') move(0);
            else if (event.key === 'End') move(options.length - 1);
            else return;
            event.preventDefault();
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
