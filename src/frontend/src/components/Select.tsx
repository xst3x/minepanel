import { Children, Fragment, isValidElement, useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode, SelectHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import '../styles/components/Select.css';

type Option = { value: string; label: ReactNode; text: string; disabled: boolean };
type OptionProps = { value?: string | number; disabled?: boolean; children?: ReactNode };

function nodeText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (isValidElement(node)) return nodeText((node.props as { children?: ReactNode }).children);
  return '';
}

/** Reads <option> children (also inside fragments, arrays and <optgroup>) into a flat list. */
function collectOptions(children: ReactNode, out: Option[] = []): Option[] {
  Children.forEach(children, child => {
    if (!isValidElement(child)) return;
    const props = child.props as OptionProps;
    if (child.type === 'option') {
      const text = nodeText(props.children);
      out.push({ value: props.value !== undefined ? String(props.value) : text, label: props.children, text, disabled: !!props.disabled });
    } else if (child.type === 'optgroup' || child.type === Fragment) {
      collectOptions(props.children, out);
    }
  });
  return out;
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'multiple' | 'size'> & {
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
};

/**
 * Themed single-select dropdown. Drop-in for <select> with <option> children:
 * `onChange` receives an event whose `target.value` is the chosen value.
 * Implements the WAI-ARIA combobox/listbox pattern (arrows, Home/End, Enter/Space, Esc, type-ahead).
 * Use a native <select multiple> where multiple selection is needed.
 */
export default function Select({ value, onChange, children, style, className = '', disabled, id, name, title, ...rest }: SelectProps) {
  const autoId = useId();
  const triggerId = id || `mp-select-${autoId}`;
  const listId = `${triggerId}-listbox`;
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: '', timer: 0 });
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [pos, setPos] = useState({ left: 0, top: 0, bottom: 0, minWidth: 0, dropUp: false });

  const options = collectOptions(children);
  const current = String(Array.isArray(value) ? (value[0] ?? '') : (value ?? ''));
  const selectedIdx = options.findIndex(o => o.value === current);
  const display = selectedIdx >= 0 ? options[selectedIdx].label : (current || options[0]?.label);

  const updatePos = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    setPos({ left: r.left, top: r.bottom + 6, bottom: window.innerHeight - r.top + 6, minWidth: r.width, dropUp: below < 260 && r.top > below });
  };

  const firstEnabled = () => options.findIndex(o => !o.disabled);
  const move = (from: number, dir: 1 | -1) => {
    if (!options.length) return -1;
    let i = from;
    for (let n = 0; n < options.length; n++) {
      i = (i + dir + options.length) % options.length;
      if (!options[i].disabled) return i;
    }
    return from;
  };

  useEffect(() => {
    if (!open) return;
    updatePos();
    setActiveIdx(selectedIdx >= 0 ? selectedIdx : firstEnabled());
    const onScroll = (e: Event) => { if (!listRef.current?.contains(e.target as Node)) updatePos(); };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (containerRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('mousedown', onDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep the keyboard-active option visible
  useEffect(() => {
    if (!open || activeIdx < 0) return;
    (listRef.current?.children[activeIdx] as HTMLElement | undefined)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIdx, open]);

  const choose = (opt: Option) => {
    if (opt.disabled || disabled) return;
    setOpen(false);
    triggerRef.current?.focus();
    if (opt.value === current) return;
    const target = { value: opt.value, name: name ?? '', id: triggerId };
    onChange?.({ target, currentTarget: target } as unknown as ChangeEvent<HTMLSelectElement>);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); setOpen(true); }
      return;
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActiveIdx(i => move(i, 1)); break;
      case 'ArrowUp': e.preventDefault(); setActiveIdx(i => move(i, -1)); break;
      case 'Home': e.preventDefault(); setActiveIdx(firstEnabled()); break;
      case 'End': e.preventDefault(); setActiveIdx(options.length - 1 - [...options].reverse().findIndex(o => !o.disabled)); break;
      case 'Enter':
      case ' ': e.preventDefault(); if (options[activeIdx]) choose(options[activeIdx]); break;
      case 'Escape': e.preventDefault(); setOpen(false); break;
      case 'Tab': setOpen(false); break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          window.clearTimeout(typed.current.timer);
          typed.current.text += e.key.toLowerCase();
          typed.current.timer = window.setTimeout(() => { typed.current.text = ''; }, 600);
          const hit = options.findIndex(o => !o.disabled && o.text.toLowerCase().startsWith(typed.current.text));
          if (hit >= 0) setActiveIdx(hit);
        }
    }
  };

  return (
    <div ref={containerRef} className={`custom-select-container ${className}`.trim()} style={style} data-disabled={disabled ? 'true' : undefined}>
      <div
        ref={triggerRef}
        id={triggerId}
        className={`custom-select-display${open ? ' open' : ''}`}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && activeIdx >= 0 ? `${listId}-opt-${activeIdx}` : undefined}
        aria-label={rest['aria-label']}
        aria-labelledby={rest['aria-labelledby']}
        aria-disabled={disabled || undefined}
        title={title}
        tabIndex={disabled ? -1 : 0}
        onClick={() => { if (!disabled) setOpen(o => !o); }}
        onKeyDown={onKeyDown}
      >
        <span className="custom-select-value">{display}</span>
        <svg className="custom-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      {name && <input type="hidden" name={name} value={current} />}

      {open && !disabled && createPortal(
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={rest['aria-label']}
          className="custom-select-dropdown"
          style={{
            left: pos.left,
            minWidth: pos.minWidth,
            maxWidth: `calc(100vw - ${Math.round(pos.left)}px - 8px)`,
            ...(pos.dropUp ? { bottom: pos.bottom } : { top: pos.top }),
          }}
          // React bubbles events from portals to ancestors; keep clicks here from reaching a modal backdrop handler.
          onClick={e => e.stopPropagation()}
        >
          {options.length === 0 && <div className="custom-select-empty">No options available</div>}
          {options.map((opt, i) => (
            <div
              key={i}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={i === selectedIdx}
              aria-disabled={opt.disabled || undefined}
              className={`custom-select-option${i === selectedIdx ? ' selected' : ''}${i === activeIdx ? ' active' : ''}${opt.disabled ? ' disabled' : ''}`}
              onClick={() => choose(opt)}
              onMouseEnter={() => { if (!opt.disabled) setActiveIdx(i); }}
            >
              {opt.label}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
