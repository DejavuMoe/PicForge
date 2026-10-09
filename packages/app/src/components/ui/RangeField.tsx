import { getRangeProgressStyle } from '../../utils/rangeProgress';
import { NumberField } from './NumberField';

/** A range and its exact value share one row, one height and one disabled state. */
export function RangeField({
  id,
  value,
  min,
  max,
  disabled,
  label,
  valueLabel,
  onChange,
}: {
  id?: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  /** Accessible name of the range. */
  label: string;
  /** Accessible name of the number field. */
  valueLabel: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="pf-range-field">
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        aria-label={label}
        style={getRangeProgressStyle(value, min, max)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <NumberField
        className="pf-number-value"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        aria-label={valueLabel}
        onValueChange={onChange}
      />
    </div>
  );
}
