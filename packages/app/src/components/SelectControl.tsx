import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
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

/** One themed select-only combobox for every tool, including its popup. */
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
    isValidElement<{ value: string | number; children: ReactNode; disabled?: boolean }>,
  );
  const selected = Math.max(
    0,
    options.findIndex((option) => String(option.props.value) === String(value)),
  );
  const [popup, setPopup] = useState<{
    left: number;
    top?: number;
    bottom?: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [active, setActive] = useState(selected);
  const [keyboard, setKeyboard] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef({ text: '', time: 0 });
  const id = useId();
  const open = (fromKeyboard: boolean) => {
    const element = trigger.current;
    if (!element || element.matches(':disabled') || element.closest('[hidden]')) return;
    const rect = element.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 180), innerWidth - 24);
    const height = Math.min(options.length * 44 + 8, 280);
    const below = innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const down = below >= Math.min(height, above);
    const maxHeight = Math.max(44, Math.min(height, down ? below : above));
    setActive(selected);
    setKeyboard(fromKeyboard);
    setPopup({
      left: Math.max(12, Math.min(rect.left, innerWidth - width - 12)),
      ...(down ? { top: rect.bottom + 4 } : { bottom: innerHeight - rect.top + 4 }),
      width,
      maxHeight,
    });
  };
  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.props.disabled || trigger.current?.matches(':disabled')) return;
    onValueChange(String(option.props.value));
    setPopup(null);
  };
  useLayoutEffect(() => {
    if (popup && (trigger.current?.matches(':disabled') || trigger.current?.closest('[hidden]')))
      setPopup(null);
  }, [popup, disabled]);
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
    const visibility = () => {
      if (document.hidden) close();
    };
    window.addEventListener('pointerdown', outside);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('popstate', close);
    document.addEventListener('fullscreenchange', close);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('popstate', close);
      document.removeEventListener('fullscreenchange', close);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [popup]);
  useEffect(() => {
    if (popup && keyboard) menu.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, popup, keyboard]);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        className={`pf-select ${className}`}
        disabled={disabled}
        data-value={value}
        aria-label={label}
        aria-description={title}
        aria-haspopup="listbox"
        aria-expanded={!!popup}
        aria-controls={popup ? id : undefined}
        aria-activedescendant={popup ? `${id}-${active}` : undefined}
        onBlur={() => setPopup(null)}
        onClick={(event) => (popup ? setPopup(null) : open(event.detail === 0))}
        onKeyDown={(event) => {
          const key = event.key;
          if (key === 'Escape' && popup) {
            event.preventDefault();
            event.stopPropagation();
            setPopup(null);
            return;
          }
          if (key === 'Tab') {
            setPopup(null);
            return;
          }
          if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(key)) {
            event.preventDefault();
            if (!popup) {
              open(true);
              return;
            }
            if (key === 'Enter' || key === ' ') choose(active);
            else {
              setKeyboard(true);
              const direction = key === 'ArrowUp' || key === 'End' ? -1 : 1;
              let next =
                key === 'Home'
                  ? 0
                  : key === 'End'
                    ? options.length - 1
                    : (active + direction + options.length) % options.length;
              for (let tries = 0; tries < options.length && options[next].props.disabled; tries++)
                next = (next + direction + options.length) % options.length;
              setActive(next);
            }
          } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            const now = Date.now();
            search.current = {
              text:
                (now - search.current.time < 700 ? search.current.text : '') + key.toLowerCase(),
              time: now,
            };
            const index = options.findIndex(
              (option) =>
                !option.props.disabled &&
                String(option.props.children).toLowerCase().startsWith(search.current.text),
            );
            if (index >= 0) {
              if (!popup) open(true);
              setKeyboard(true);
              setActive(index);
            }
          }
        }}
      >
        <span>{options[selected]?.props.children}</span>
        <FiChevronDown aria-hidden />
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
            onPointerDown={(event) => event.preventDefault()}
            onPointerMove={(event) => {
              if (event.movementX || event.movementY) setKeyboard(false);
            }}
          >
            {options.map((option, index) => (
              <button
                type="button"
                role="option"
                tabIndex={-1}
                key={String(option.props.value)}
                id={`${id}-${index}`}
                data-value={option.props.value}
                aria-selected={index === selected}
                disabled={option.props.disabled}
                data-active={keyboard && index === active}
                className="pf-select-option"
                onClick={() => choose(index)}
              >
                <span>{option.props.children}</span>
                {index === selected && <FiCheck aria-hidden />}
              </button>
            ))}
          </div>,
          document.fullscreenElement ?? document.body,
        )}
    </>
  );
}
