import { useEffect, useId, useRef, useState } from 'react';
import { UserCheck } from 'lucide-react';
import { adminOrdersApi, type AdminLookupCustomer } from '../api/endpoints';
import { displayPhone } from '../../shared/lib/format';

/**
 * A text input that suggests past customers as the rep types — by name OR by
 * partial number, because at a counter the person is known by name and the
 * number is the bit nobody remembers.
 *
 * Picking one fills name, phone and last address in a single tap. Keyboard is
 * first-class (↑ ↓ Enter Esc): this screen runs 100-200x a day and a rep who
 * has to reach for the mouse mid-order loses more time than the lookup saves.
 *
 * Requests are debounced and stale replies are discarded — typing fast would
 * otherwise let an earlier, slower response overwrite a newer one.
 */
export function CustomerSuggest({
  value,
  onChange,
  onPick,
  label,
  placeholder,
  inputMode,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (c: AdminLookupCustomer) => void;
  label: string;
  placeholder?: string;
  inputMode?: 'text' | 'numeric';
  className?: string;
}) {
  const [results, setResults] = useState<AdminLookupCustomer[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Set while a pick is being applied, so the resulting value change does not
  // immediately re-open the list the rep just chose from.
  const justPicked = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (justPicked.current) {
      justPicked.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      adminOrdersApi
        .searchCustomers(q)
        .then(({ customers }) => {
          if (cancelled) return;
          setResults(customers);
          setActive(0);
          setOpen(customers.length > 0);
        })
        .catch(() => {
          /* suggestions are a convenience — never block typing */
        });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value]);

  // Close when focus leaves the whole control (input + list).
  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, []);

  const pick = (c: AdminLookupCustomer) => {
    justPicked.current = true;
    setOpen(false);
    setResults([]);
    onPick(c);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      // Only swallow Enter when a suggestion is genuinely highlighted, so it
      // still submits normally when the list is closed.
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <label className="block">
        <span className="text-xs font-semibold text-brand-600">{label}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          inputMode={inputMode}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          className={`mt-1 ${className ?? ''}`}
        />
      </label>

      {open && results.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-cream-300 bg-white py-1 shadow-lift"
        >
          {results.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                // mousedown, not click: the input's blur would close the list
                // before a click ever landed.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-start gap-2 px-3 py-2 text-left ${
                  i === active ? 'bg-cream-100' : 'hover:bg-cream-50'
                }`}
              >
                <UserCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-brand-900">{c.name}</span>
                  <span className="block truncate text-xs text-brand-500">
                    {displayPhone(c.phone)}
                    {c.address_text ? ` · ${c.address_text}` : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
