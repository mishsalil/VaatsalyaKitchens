import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

const STORAGE_KEY = 'vk-menu-collapsed';

function loadCollapsed(): Set<number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((n) => typeof n === 'number')) : new Set();
  } catch {
    return new Set();
  }
}

function saveCollapsed(set: Set<number>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

/**
 * A collapsible menu section. Renders the scroll-spy anchor (`cat-${id}`) and a
 * clickable header that expands/collapses the dish rows (persisted in
 * localStorage so the user's choice survives reloads). The sticky category pills
 * live in `CategoryTabs` above; `scroll-mt-32` makes smooth-scroll land below
 * the app bar + sticky tabs. Sections start expanded.
 */
export function MenuCategory({ id, name, children }: { id: number; name: string; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState<boolean>(() => loadCollapsed().has(id));

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      const set = loadCollapsed();
      if (next) set.add(id);
      else set.delete(id);
      saveCollapsed(set);
      return next;
    });
  };

  return (
    <section id={`cat-${id}`} className="scroll-mt-32">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls={`cat-body-${id}`}
        className="flex w-full items-center justify-between rounded-xl px-1 pb-2 pt-6 text-left transition-colors hover:bg-cream-100/60"
      >
        <h3 className="text-lg font-bold text-brand-900">{name}</h3>
        <ChevronDown
          className={`h-5 w-5 text-brand-500 transition-transform ${collapsed ? '' : 'rotate-180'}`}
          aria-hidden="true"
        />
      </button>
      {!collapsed && (
        <div id={`cat-body-${id}`} className="divide-y divide-cream-200 overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-card">
          {children}
        </div>
      )}
    </section>
  );
}