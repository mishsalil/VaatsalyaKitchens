import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { cartKey, linePrice, type CartAddon, type CartLine, type CartVariant } from '../types';

const STORAGE_KEY = 'vk-cart-v2';

/** Spec the picker/menu row passes when adding a configured item. */
export interface AddSpec {
  id: number;
  name: string;
  unit: string;
  basePrice: number;
  variants?: CartVariant[];
  addons?: CartAddon[];
  qty?: number;
}

interface CartContextValue {
  lines: CartLine[];
  count: number;
  total: number;
  add: (spec: AddSpec) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  has: (key: string) => boolean;
  qtyOf: (key: string) => number;
  /** Total qty across every configuration of one item (for the on-card stepper). */
  qtyOfItem: (id: number) => number;
  /** Most-recent line for an item (used by the on-card minus button). */
  lastLineOfItem: (id: number) => CartLine | undefined;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

function load(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (l: Partial<CartLine>): l is CartLine =>
        typeof l.key === 'string' &&
        typeof l.id === 'number' &&
        Array.isArray(l.variants) &&
        Array.isArray(l.addons)
    );
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* ignore */
    }
  }, [lines]);

  const add = useCallback((spec: AddSpec) => {
    const qty = spec.qty ?? 1;
    const variants = spec.variants ?? [];
    const key = cartKey(spec.id, variants.map((v) => v.id), (spec.addons ?? []).map((a) => a.id));
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l));
      }
      return [
        ...prev,
        {
          key,
          id: spec.id,
          name: spec.name,
          unit: spec.unit,
          basePrice: spec.basePrice,
          variants,
          addons: spec.addons ?? [],
          qty,
        },
      ];
    });
  }, []);

  const setQty = useCallback((key: string, qty: number) => {
    setLines((prev) =>
      qty <= 0
        ? prev.filter((l) => l.key !== key)
        : prev.map((l) => (l.key === key ? { ...l, qty } : l))
    );
  }, []);

  const remove = useCallback((key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const has = useCallback((key: string) => lines.some((l) => l.key === key), [lines]);
  const qtyOf = useCallback((key: string) => lines.find((l) => l.key === key)?.qty ?? 0, [lines]);
  const qtyOfItem = useCallback(
    (id: number) => lines.filter((l) => l.id === id).reduce((n, l) => n + l.qty, 0),
    [lines]
  );
  const lastLineOfItem = useCallback(
    (id: number) => {
      const matches = lines.filter((l) => l.id === id);
      return matches[matches.length - 1];
    },
    [lines]
  );

  const count = lines.reduce((n, l) => n + l.qty, 0);
  const total = lines.reduce((n, l) => n + l.qty * linePrice(l), 0);

  return (
    <CartContext.Provider
      value={{ lines, count, total, add, setQty, remove, clear, has, qtyOf, qtyOfItem, lastLineOfItem }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}