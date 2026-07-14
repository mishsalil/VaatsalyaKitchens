import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '../../shared/components/ui/Modal';
import { Field } from '../../shared/components/ui/Field';
import { Input, Select } from '../../shared/components/ui/Input';
import { Button } from '../../shared/components/ui/Button';
import { FormError } from '../../shared/components/ui/FormError';
import { rupees } from '../../shared/lib/format';
import type { AdminMenuCategory, AdminMenuSubcategory, AdminMenuItem } from '../types';
import type { AdminItemPayload, AdminVariantInput, AdminAddonInput } from '../api/endpoints';

type Props = {
  open: boolean;
  onClose: () => void;
  /** When editing an existing item; undefined when adding. */
  item?: AdminMenuItem;
  /** Default category for a new item (preselected). */
  defaultCategoryId?: number;
  categories: AdminMenuCategory[];
  subcategories: AdminMenuSubcategory[];
  onSubmit: (data: AdminItemPayload) => Promise<void>;
};

interface VariantRow {
  id?: number;
  name: string;
  delta: string;
  isDefault: boolean;
}
interface AddonRow {
  id?: number;
  name: string;
  price: string;
  available: boolean;
}

/** Add-or-edit modal for a menu item. Validates non-empty name + numeric price,
 *  and optional variants (signed delta, one default) and add-ons (price ≥ 0). */
export function ItemFormModal({ open, onClose, item, defaultCategoryId, categories, subcategories, onSubmit }: Props) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [subcategoryId, setSubcategoryId] = useState<number | ''>('');
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [addons, setAddons] = useState<AddonRow[]>([]);
  const [variantErrs, setVariantErrs] = useState<string[]>([]);
  const [addonErrs, setAddonErrs] = useState<string[]>([]);
  const [nameErr, setNameErr] = useState('');
  const [priceErr, setPriceErr] = useState('');
  const [catErr, setCatErr] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNameErr(''); setPriceErr(''); setCatErr(''); setFormError('');
    setVariantErrs([]); setAddonErrs([]);
    setBusy(false);
    if (item) {
      setName(item.name);
      setPrice(String(item.price));
      setUnit(item.unit);
      setCategoryId(item.category_id);
      setSubcategoryId(item.subcategory_id ?? '');
      setVariants(
        item.variants.length
          ? item.variants.map((v) => ({ id: v.id, name: v.name, delta: String(v.price_delta), isDefault: v.is_default }))
          : []
      );
      setAddons(
        item.addons.length
          ? item.addons.map((a) => ({ id: a.id, name: a.name, price: String(a.price), available: a.available }))
          : []
      );
    } else {
      setName('');
      setPrice('');
      setUnit('');
      setCategoryId(defaultCategoryId ?? categories[0]?.id ?? '');
      setSubcategoryId('');
      setVariants([]);
      setAddons([]);
    }
  }, [open, item, defaultCategoryId, categories]);

  const catSubs = subcategories.filter((s) => s.category_id === categoryId);

  const changeCategory = (id: number) => {
    setCategoryId(id);
    setCatErr('');
    // Clear subcategory if it doesn't belong to the new category.
    const subs = subcategories.filter((s) => s.category_id === id);
    if (!subs.some((s) => s.id === subcategoryId)) setSubcategoryId('');
  };

  const addVariant = () =>
    setVariants((prev) => [...prev, { name: '', delta: '0', isDefault: prev.length === 0 }]);
  const updateVariant = (i: number, patch: Partial<VariantRow>) =>
    setVariants((prev) => prev.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  const removeVariant = (i: number) =>
    setVariants((prev) => prev.filter((_, idx) => idx !== i));
  const setDefaultVariant = (i: number) =>
    setVariants((prev) => prev.map((v, idx) => ({ ...v, isDefault: idx === i })));

  const addAddon = () => setAddons((prev) => [...prev, { name: '', price: '0', available: true }]);
  const updateAddon = (i: number, patch: Partial<AddonRow>) =>
    setAddons((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  const removeAddon = (i: number) => setAddons((prev) => prev.filter((_, idx) => idx !== i));

  const submit = async () => {
    setFormError('');
    const trimmedName = name.trim();
    const priceNum = Number(String(price).replace(/[^0-9.]/g, ''));
    let ok = true;
    if (!trimmedName) { setNameErr('Please enter an item name.'); ok = false; } else setNameErr('');
    if (!isFinite(priceNum) || priceNum < 0) { setPriceErr('Please enter a valid price.'); ok = false; } else setPriceErr('');
    if (!categoryId) { setCatErr('Please choose a category.'); ok = false; } else setCatErr('');

    // Validate variant rows that have a name. Deltas may be negative; empty → 0.
    const vErrs = variants.map((v) => {
      if (!v.name.trim()) return '';
      const d = v.delta.trim() === '' ? 0 : Number(v.delta.replace(/[^0-9.\-]/g, ''));
      if (!isFinite(d)) return 'Enter a valid price delta (e.g. +150 or -70).';
      return '';
    });
    setVariantErrs(vErrs);
    if (vErrs.some(Boolean)) ok = false;

    const aErrs = addons.map((a) => {
      if (!a.name.trim()) return '';
      const p = Number(String(a.price).replace(/[^0-9.]/g, ''));
      if (!isFinite(p) || p < 0) return 'Enter a valid add-on price.';
      return '';
    });
    setAddonErrs(aErrs);
    if (aErrs.some(Boolean)) ok = false;

    if (!ok) return;

    const variantPayload: AdminVariantInput[] = variants
      .filter((v) => v.name.trim())
      .map((v) => ({
        id: v.id,
        name: v.name.trim(),
        price_delta: v.delta.trim() === '' ? 0 : Number(v.delta.replace(/[^0-9.\-]/g, '')),
        is_default: v.isDefault,
      }));
    // Guarantee exactly one default when there is at least one variant.
    if (variantPayload.length > 0 && !variantPayload.some((v) => v.is_default)) {
      variantPayload[0].is_default = true;
    }

    const addonPayload: AdminAddonInput[] = addons
      .filter((a) => a.name.trim())
      .map((a) => ({
        id: a.id,
        name: a.name.trim(),
        price: Number(String(a.price).replace(/[^0-9.]/g, '')) || 0,
        available: a.available,
      }));

    setBusy(true);
    try {
      await onSubmit({
        name: trimmedName,
        price: priceNum,
        unit: unit.trim(),
        category_id: Number(categoryId),
        subcategory_id: subcategoryId || null,
        variants: variantPayload,
        addons: addonPayload,
      });
      onClose();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? 'Edit item' : 'Add item'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{item ? 'Save' : 'Add'}</Button>
        </>
      }
    >
      <div className="space-y-3">
        {formError && <FormError message={formError} />}
        <Field label="Item name" htmlFor="item-name" error={nameErr}>
          <Input id="item-name" value={name} invalid={!!nameErr} onChange={(e) => { setName(e.target.value); setNameErr(''); }} placeholder="e.g. Paneer Tikka" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Base price (₹)" htmlFor="item-price" error={priceErr} hint="exclusive of GST">
            <Input id="item-price" inputMode="decimal" value={price} invalid={!!priceErr} onChange={(e) => { setPrice(e.target.value); setPriceErr(''); }} placeholder="250" />
          </Field>
          <Field label="Unit" htmlFor="item-unit" hint="optional">
            <Input id="item-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="per plate" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category" htmlFor="item-cat" error={catErr}>
            <Select id="item-cat" value={categoryId} invalid={!!catErr} onChange={(e) => changeCategory(Number(e.target.value))}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Subcategory" htmlFor="item-sub" hint="optional">
            <Select id="item-sub" value={subcategoryId} onChange={(e) => setSubcategoryId(Number(e.target.value))} disabled={catSubs.length === 0}>
              <option value="">— None —</option>
              {catSubs.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Variants editor */}
        <div className="rounded-xl border border-cream-200 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">Sizes / variants</p>
            <button type="button" onClick={addVariant} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900">
              <Plus className="h-3.5 w-3.5" /> Add variant
            </button>
          </div>
          <p className="mt-1 text-xs text-brand-400">
            Each variant adds its delta to the base price. Mark one as the default size shown first.
          </p>
          {variants.length === 0 ? (
            <p className="mt-2 text-xs text-brand-300">No variants — customers order at the base price.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {variants.map((v, i) => (
                <li key={i} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <label className="flex shrink-0 items-center gap-1 text-xs text-brand-500" title="Default size">
                      <input
                        type="radio"
                        name="variant-default"
                        checked={v.isDefault}
                        onChange={() => setDefaultVariant(i)}
                        className="accent-brand-900"
                      />
                    </label>
                    <Input
                      value={v.name}
                      invalid={!!variantErrs[i]}
                      onChange={(e) => updateVariant(i, { name: e.target.value })}
                      placeholder="e.g. Full"
                      className="flex-1"
                    />
                    <Input
                      value={v.delta}
                      invalid={!!variantErrs[i]}
                      onChange={(e) => updateVariant(i, { delta: e.target.value })}
                      placeholder="+150"
                      inputMode="decimal"
                      className="w-24"
                    />
                    <span className="shrink-0 text-xs text-brand-400">
                      = {rupees(Number(String(price).replace(/[^0-9.]/g, '') || 0) + (v.delta.trim() === '' ? 0 : Number(v.delta.replace(/[^0-9.\-]/g, '')) || 0))}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeVariant(i)}
                      className="rounded-lg p-1.5 text-brand-300 hover:bg-cream-100 hover:text-red-600"
                      aria-label="Remove variant"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {variantErrs[i] && <p className="pl-6 text-xs font-medium text-red-600">{variantErrs[i]}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add-ons editor */}
        <div className="rounded-xl border border-cream-200 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">Add-ons</p>
            <button type="button" onClick={addAddon} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900">
              <Plus className="h-3.5 w-3.5" /> Add add-on
            </button>
          </div>
          <p className="mt-1 text-xs text-brand-400">Optional extras customers can tick (each adds its price).</p>
          {addons.length === 0 ? (
            <p className="mt-2 text-xs text-brand-300">No add-ons for this item.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {addons.map((a, i) => (
                <li key={i} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Input
                      value={a.name}
                      invalid={!!addonErrs[i]}
                      onChange={(e) => updateAddon(i, { name: e.target.value })}
                      placeholder="e.g. Extra cheese"
                      className="flex-1"
                    />
                    <Input
                      value={a.price}
                      invalid={!!addonErrs[i]}
                      onChange={(e) => updateAddon(i, { price: e.target.value })}
                      placeholder="40"
                      inputMode="decimal"
                      className="w-24"
                    />
                    <label className="flex shrink-0 items-center gap-1 text-xs text-brand-500">
                      <input
                        type="checkbox"
                        checked={a.available}
                        onChange={(e) => updateAddon(i, { available: e.target.checked })}
                        className="accent-brand-900"
                      />
                      On
                    </label>
                    <button
                      type="button"
                      onClick={() => removeAddon(i)}
                      className="rounded-lg p-1.5 text-brand-300 hover:bg-cream-100 hover:text-red-600"
                      aria-label="Remove add-on"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {addonErrs[i] && <p className="text-xs font-medium text-red-600">{addonErrs[i]}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}