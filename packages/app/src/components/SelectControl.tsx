import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { FiCheck, FiChevronDown } from 'react-icons/fi';

interface Props {
  value: string | number;
  onValueChange: (value: string) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
  'aria-label'?: string;
}

/** Shared select-only combobox; its popup escapes clipped toolbars via a portal. */
export function SelectControl({
  value,
  onValueChange,
  children,
  className = '',
  disabled,
  title,
  'aria-label': label,
}: Props) {
  const options = Children.toArray(children).filter(
    isValidElement<{ value: string | number; children: ReactNode }>,
  );
  const selected = Math.max(
    0,
    options.findIndex((option) => String(option.props.value) === String(value)),
  );
  const [popup, setPopup] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [active, setActive] = useState(selected);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef({ text: '', time: 0 });
  const id = useId();

  const open = () => {
    const rect = trigger.current!.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 180), window.innerWidth - 24);
    const height = Math.min(options.length * 40 + 12, 280);
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const down = below >= Math.min(height, above);
    const maxHeight = Math.max(40, Math.min(height, down ? below : above));
    setActive(selected);
    setPopup({
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      top: down ? rect.bottom + 6 : rect.top - maxHeight - 6,
      width,
      maxHeight,
    });
  };
  const choose = (index: number) => {
    onValueChange(String(options[index].props.value));
    setPopup(null);
  };
  useEffect(() => {
    if (!popup) return;
    const close = () => setPopup(null);
    const outside = (event: PointerEvent) => {
      if (
        !trigger.current?.contains(event.target as Node) &&
        !menu.current?.contains(event.target as Node)
      )
        close();
    };
    const scroll = (event: Event) => {
      if (!menu.current?.contains(event.target as Node)) close();
    };
    window.addEventListener('pointerdown', outside);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', scroll, true);
    return () => {
      window.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [popup]);
  useEffect(() => {
    if (popup) menu.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, popup]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        className={`pf-select ${className}`}
        disabled={disabled}
        aria-label={label}
        aria-description={title}
        aria-haspopup="listbox"
        aria-expanded={!!popup}
        aria-controls={popup ? id : undefined}
        aria-activedescendant={popup ? `${id}-${active}` : undefined}
        onBlur={() => setPopup(null)}
        onClick={() => (popup ? setPopup(null) : open())}
        onKeyDown={(event) => {
          const key = event.key;
          if (key === 'Escape' || key === 'Tab') {
            setPopup(null);
            return;
          }
          if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(key)) {
            event.preventDefault();
            if (!popup) {
              open();
              return;
            }
            if (key === 'Enter' || key === ' ') choose(active);
            else
              setActive(
                key === 'Home'
                  ? 0
                  : key === 'End'
                    ? options.length - 1
                    : (active + (key === 'ArrowDown' ? 1 : -1) + options.length) % options.length,
              );
          } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            const now = Date.now();
            search.current = {
              text:
                (now - search.current.time < 700 ? search.current.text : '') + key.toLowerCase(),
              time: now,
            };
            const index = options.findIndex((option) =>
              String(option.props.children).toLowerCase().startsWith(search.current.text),
            );
            if (index >= 0) {
              if (!popup) open();
              setActive(index);
            }
          }
        }}
      >
        <span>{options[selected]?.props.children}</span>
        <FiChevronDown aria-hidden="true" />
      </button>
      {popup &&
        createPortal(
          <div
            ref={menu}
            id={id}
            role="listbox"
            aria-label={label}
            className="pf-select-menu"
            style={popup}
            onMouseDown={(event) => event.preventDefault()}
          >
            {options.map((option, index) => (
              <div
                key={String(option.props.value)}
                id={`${id}-${index}`}
                role="option"
                aria-selected={index === selected}
                className={`pf-select-option${index === active ? ' is-active' : ''}`}
                onPointerMove={() => setActive(index)}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  choose(index);
                }}
              >
                <span>{option.props.children}</span>
                {index === selected && <FiCheck aria-hidden="true" />}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
