import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, ChevronDown } from 'lucide-react';
import { useFetch } from '../../shared/hooks/useFetch';
import { useToast } from '../../shared/context/ToastContext';
import { Skeleton } from '../../shared/components/Skeleton';
import { Switch } from '../../shared/components/ui/Switch';
import { Button } from '../../shared/components/ui/Button';
import { Input } from '../../shared/components/ui/Input';
import { Modal } from '../../shared/components/ui/Modal';
import { Field } from '../../shared/components/ui/Field';
import { rupees } from '../../shared/lib/format';
import { sampleMenuCsv } from '../../shared/lib/sampleCsv';
import { adminMenuApi, type AdminItemPayload } from '../api/endpoints';
import type { AdminMenuCategory, AdminMenuSubcategory, AdminMenuItem } from '../types';
import { ItemFormModal } from './ItemFormModal';
import { ConfirmDialog } from './ConfirmDialog';
import { ImportExportBar } from './ImportExportBar';

/* ---- collapsible-section persistence (categories + subcategory groups) ---- */
const COLLAPSE_KEY = 'vk-admin-menu-collapsed';
function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? new Set(parsed.filter((s) => typeof s === 'string')) : new Set();
  } catch {
    return new Set();
  }
}
function saveCollapsed(set: Set<string>) {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}
function useCollapsed() {
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);
  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveCollapsed(next);
      return next;
    });
  return { collapsed, toggle };
}

/** Full menu CRUD board: collapsible category sections, each holding
 *  collapsible subcategory groups of inline item rows. Toggle, rename, delete,
 *  reorder (up/down), and add/edit via modals. Subcategories are managed like
 *  categories. Items with no subcategory render in an implicit top group. */
export function MenuManager() {
  const toast = useToast();
  const { data, loading, error, refetch } = useFetch(() => adminMenuApi.list(), []);
  const categories = data?.categories ?? [];
  const subcategories = data?.subcategories ?? [];
  const items = data?.items ?? [];
  const { collapsed, toggle } = useCollapsed();

  // modal state
  const [itemModal, setItemModal] = useState<{ item?: AdminMenuItem; categoryId?: number } | null>(null);
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [renameCat, setRenameCat] = useState<AdminMenuCategory | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [addSub, setAddSub] = useState<AdminMenuCategory | null>(null);
  const [newSub, setNewSub] = useState('');
  const [renameSub, setRenameSub] = useState<AdminMenuSubcategory | null>(null);
  const [renameSubValue, setRenameSubValue] = useState('');
  const [confirm, setConfirm] = useState<{ kind: 'category' | 'subcategory' | 'item'; id: number; name: string } | null>(null);

  const itemsByCat = useMemo(() => {
    const map = new Map<number, AdminMenuItem[]>();
    for (const it of items) {
      const arr = map.get(it.category_id) ?? [];
      arr.push(it);
      map.set(it.category_id, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    return map;
  }, [items]);

  const subcatsByCat = useMemo(() => {
    const map = new Map<number, AdminMenuSubcategory[]>();
    for (const s of subcategories) {
      const arr = map.get(s.category_id) ?? [];
      arr.push(s);
      map.set(s.category_id, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    return map;
  }, [subcategories]);

  const sortedCats = useMemo(
    () => [...categories].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
    [categories],
  );

  // --- category actions ---
  const addCategory = async () => {
    const name = newCat.trim();
    if (!name) return;
    try {
      await adminMenuApi.addCategory(name);
      setNewCat('');
      setAddCatOpen(false);
      toast.success('Category added');
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const saveRename = async () => {
    if (!renameCat) return;
    const name = renameValue.trim();
    if (!name) return;
    try {
      await adminMenuApi.renameCategory(renameCat.id, name);
      setRenameCat(null);
      toast.success('Renamed');
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const toggleCategory = async (cat: AdminMenuCategory, active: boolean) => {
    try {
      await adminMenuApi.toggleCategory(cat.id, active);
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const moveCategory = async (cat: AdminMenuCategory, dir: -1 | 1) => {
    const idx = sortedCats.findIndex((c) => c.id === cat.id);
    const swap = sortedCats[idx + dir];
    if (!swap) return;
    const order = sortedCats.map((c) => c.id);
    [order[idx], order[idx + dir]] = [order[idx + dir], order[idx]];
    try {
      await adminMenuApi.reorderCategories(order);
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // --- subcategory actions ---
  const addSubcategory = async () => {
    if (!addSub) return;
    const name = newSub.trim();
    if (!name) return;
    try {
      await adminMenuApi.addSubcategory(addSub.id, name);
      setNewSub('');
      setAddSub(null);
      toast.success('Subcategory added');
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const saveRenameSub = async () => {
    if (!renameSub) return;
    const name = renameSubValue.trim();
    if (!name) return;
    try {
      await adminMenuApi.renameSubcategory(renameSub.id, name);
      setRenameSub(null);
      toast.success('Renamed');
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const toggleSubcategory = async (s: AdminMenuSubcategory, active: boolean) => {
    try {
      await adminMenuApi.toggleSubcategory(s.id, active);
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const moveSubcategory = async (catId: number, sub: AdminMenuSubcategory, dir: -1 | 1) => {
    const arr = subcatsByCat.get(catId) ?? [];
    const idx = arr.findIndex((x) => x.id === sub.id);
    const swap = arr[idx + dir];
    if (!swap) return;
    const order = arr.map((x) => x.id);
    [order[idx], order[idx + dir]] = [order[idx + dir], order[idx]];
    try {
      await adminMenuApi.reorderSubcategories(order);
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // --- item actions ---
  const toggleItem = async (it: AdminMenuItem, available: boolean) => {
    try {
      await adminMenuApi.toggleItem(it.id, available);
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const moveItem = async (groupItems: AdminMenuItem[], it: AdminMenuItem, dir: -1 | 1) => {
    const idx = groupItems.findIndex((x) => x.id === it.id);
    const swap = groupItems[idx + dir];
    if (!swap) return;
    const order = groupItems.map((x) => x.id);
    [order[idx], order[idx + dir]] = [order[idx + dir], order[idx]];
    try {
      await adminMenuApi.reorderItems(order);
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const submitItem = async (data: AdminItemPayload) => {
    if (itemModal?.item) {
      await adminMenuApi.updateItem(itemModal.item.id, data);
      toast.success('Item updated');
    } else {
      await adminMenuApi.addItem(data);
      toast.success('Item added');
    }
    refetch();
  };

  const runConfirm = async () => {
    if (!confirm) return;
    try {
      if (confirm.kind === 'category') {
        await adminMenuApi.deleteCategory(confirm.id);
        toast.success('Category deleted');
      } else if (confirm.kind === 'subcategory') {
        await adminMenuApi.deleteSubcategory(confirm.id);
        toast.success('Subcategory deleted');
      } else {
        await adminMenuApi.deleteItem(confirm.id);
        toast.success('Item deleted');
      }
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (loading && !data) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }
  if (error) {
    return <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;
  }

  const renderItemRow = (it: AdminMenuItem, groupItems: AdminMenuItem[], ii: number) => {
    const optCount = it.variants.length + it.addons.length;
    return (
      <li key={it.id} className="flex items-center gap-2 px-4 py-2.5">
        <div className="flex flex-col">
          <button
            type="button"
            onClick={() => moveItem(groupItems, it, -1)}
            disabled={ii === 0}
            className="text-brand-300 hover:text-brand-700 disabled:opacity-30"
            aria-label="Move item up"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => moveItem(groupItems, it, 1)}
            disabled={ii === groupItems.length - 1}
            className="text-brand-300 hover:text-brand-700 disabled:opacity-30"
            aria-label="Move item down"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1">
          <p className={`text-sm font-semibold ${it.available ? 'text-brand-900' : 'text-brand-400 line-through'}`}>
            {it.name}
          </p>
          <p className="text-xs text-brand-400">
            {it.unit}
            {optCount > 0 && (
              <span className="ml-1 text-brand-500">
                · {it.variants.length} size{it.variants.length === 1 ? '' : 's'}
                {it.addons.length > 0 && `, ${it.addons.length} add-on${it.addons.length === 1 ? '' : 's'}`}
              </span>
            )}
          </p>
        </div>
        <span className="text-sm font-bold text-brand-900">{rupees(it.price)}</span>
        <Switch checked={it.available} onChange={(v) => toggleItem(it, v)} label="Item available" />
        <button
          type="button"
          onClick={() => setItemModal({ item: it })}
          className="rounded-lg p-1.5 text-brand-500 hover:bg-cream-100"
          aria-label="Edit item"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setConfirm({ kind: 'item', id: it.id, name: it.name })}
          className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
          aria-label="Delete item"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </li>
    );
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-brand-500">All menu prices are exclusive of GST — set the GST rate in Settings.</p>
        <div className="flex flex-wrap items-center gap-2">
          <ImportExportBar
            entity="Menu"
            filename="vaatsalya-menu.csv"
            sampleCsv={sampleMenuCsv()}
            sampleFilename="vaatsalya-menu-sample.csv"
            blurb={
              <>
                Columns: <code>category, subcategory, item, price, unit, available, variants, addons</code>.
                Leave <code>subcategory</code>, <code>variants</code> and <code>addons</code> empty when not needed.
                Variants: <code>Half:-70|Full:*+150</code> (the <code>*</code> marks the default size; deltas are signed).
                Add-ons: <code>Cheese:40|Cashews:60</code>. Items are matched by category + item name and updated in place.
              </>
            }
            onExport={() => adminMenuApi.export()}
            onImport={(file) => adminMenuApi.import(file)}
            onImported={refetch}
          />
          <Button variant="outline" size="sm" onClick={() => setAddCatOpen(true)}>
            <Plus className="h-4 w-4" /> Add category
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {sortedCats.map((cat, ci) => {
          const catItems = itemsByCat.get(cat.id) ?? [];
          const catSubs = subcatsByCat.get(cat.id) ?? [];
          const noSubItems = catItems.filter((it) => it.subcategory_id == null);
          const catKey = `cat-${cat.id}`;
          const catCollapsed = collapsed.has(catKey);
          return (
            <section key={cat.id} className="rounded-2xl border border-cream-200 bg-white shadow-card">
              {/* category header (clickable to collapse) */}
              <div className="flex flex-wrap items-center gap-2 border-b border-cream-200 px-4 py-3">
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => moveCategory(cat, -1)}
                    disabled={ci === 0}
                    className="text-brand-300 hover:text-brand-700 disabled:opacity-30"
                    aria-label="Move category up"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveCategory(cat, 1)}
                    disabled={ci === sortedCats.length - 1}
                    className="text-brand-300 hover:text-brand-700 disabled:opacity-30"
                    aria-label="Move category down"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(catKey)}
                  className="flex flex-1 items-center gap-2 text-left"
                  aria-expanded={!catCollapsed}
                >
                  <ChevronDown className={`h-4 w-4 text-brand-400 transition-transform ${catCollapsed ? '-rotate-90' : ''}`} />
                  <h3 className={`text-base font-bold ${cat.active ? 'text-brand-900' : 'text-brand-400 line-through'}`}>
                    {cat.name}
                    <span className="ml-2 text-xs font-normal text-brand-300">{catItems.length} item{catItems.length === 1 ? '' : 's'}</span>
                  </h3>
                </button>
                <Switch checked={cat.active} onChange={(v) => toggleCategory(cat, v)} label="Category active" />
                <button
                  type="button"
                  onClick={() => { setRenameCat(cat); setRenameValue(cat.name); }}
                  className="rounded-lg p-1.5 text-brand-500 hover:bg-cream-100"
                  aria-label="Rename category"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirm({ kind: 'category', id: cat.id, name: cat.name })}
                  className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                  aria-label="Delete category"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setAddSub(cat)}
                  className="inline-flex items-center gap-1 rounded-full border border-cream-300 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-cream-100"
                >
                  <Plus className="h-3.5 w-3.5" /> Subcategory
                </button>
                <button
                  type="button"
                  onClick={() => setItemModal({ categoryId: cat.id })}
                  className="inline-flex items-center gap-1 rounded-full border border-cream-300 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-cream-100"
                >
                  <Plus className="h-3.5 w-3.5" /> Item
                </button>
              </div>

              {/* category body */}
              {!catCollapsed && (
                <div className="space-y-0">
                  {/* implicit "no subcategory" group */}
                  {noSubItems.length > 0 && (
                    <div>
                      {catSubs.length > 0 && (
                        <p className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-brand-300">No subcategory</p>
                      )}
                      <ul className="divide-y divide-cream-100">
                        {noSubItems.map((it, ii) => renderItemRow(it, noSubItems, ii))}
                      </ul>
                    </div>
                  )}

                  {/* subcategory groups */}
                  {catSubs.map((sub, si) => {
                    const subItems = catItems.filter((it) => it.subcategory_id === sub.id);
                    const subKey = `sub-${sub.id}`;
                    const subCollapsed = collapsed.has(subKey);
                    return (
                      <div key={sub.id} className="border-t border-cream-100">
                        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                          <div className="flex flex-col">
                            <button
                              type="button"
                              onClick={() => moveSubcategory(cat.id, sub, -1)}
                              disabled={si === 0}
                              className="text-brand-300 hover:text-brand-700 disabled:opacity-30"
                              aria-label="Move subcategory up"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveSubcategory(cat.id, sub, 1)}
                              disabled={si === catSubs.length - 1}
                              className="text-brand-300 hover:text-brand-700 disabled:opacity-30"
                              aria-label="Move subcategory down"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggle(subKey)}
                            className="flex flex-1 items-center gap-2 text-left"
                            aria-expanded={!subCollapsed}
                          >
                            <ChevronDown className={`h-3.5 w-3.5 text-brand-400 transition-transform ${subCollapsed ? '-rotate-90' : ''}`} />
                            <span className={`text-sm font-semibold ${sub.active ? 'text-brand-800' : 'text-brand-400 line-through'}`}>
                              {sub.name}
                              <span className="ml-2 text-xs font-normal text-brand-300">{subItems.length}</span>
                            </span>
                          </button>
                          <Switch checked={sub.active} onChange={(v) => toggleSubcategory(sub, v)} label="Subcategory active" />
                          <button
                            type="button"
                            onClick={() => { setRenameSub(sub); setRenameSubValue(sub.name); }}
                            className="rounded-lg p-1.5 text-brand-500 hover:bg-cream-100"
                            aria-label="Rename subcategory"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirm({ kind: 'subcategory', id: sub.id, name: sub.name })}
                            className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                            aria-label="Delete subcategory"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {!subCollapsed && (
                          <ul className="divide-y divide-cream-100 border-t border-cream-100">
                            {subItems.length === 0 ? (
                              <li className="px-4 py-3 text-center text-xs text-brand-300">No items in this subcategory yet.</li>
                            ) : (
                              subItems.map((it, ii) => renderItemRow(it, subItems, ii))
                            )}
                          </ul>
                        )}
                      </div>
                    );
                  })}

                  {catItems.length === 0 && catSubs.length === 0 && (
                    <p className="px-4 py-4 text-center text-xs text-brand-300">No items yet — add one.</p>
                  )}
                </div>
              )}
            </section>
          );
        })}
        {sortedCats.length === 0 && (
          <p className="rounded-xl border border-dashed border-cream-300 px-4 py-8 text-center text-sm text-brand-400">
            No categories yet. Add one to start building the menu.
          </p>
        )}
      </div>

      {/* add category modal */}
      <Modal
        open={addCatOpen}
        onClose={() => setAddCatOpen(false)}
        title="Add category"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddCatOpen(false)}>Cancel</Button>
            <Button onClick={addCategory}>Add</Button>
          </>
        }
      >
        <Field label="Category name" htmlFor="new-cat">
          <Input id="new-cat" value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="e.g. Beverages" />
        </Field>
      </Modal>

      {/* rename category modal */}
      <Modal
        open={!!renameCat}
        onClose={() => setRenameCat(null)}
        title="Rename category"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenameCat(null)}>Cancel</Button>
            <Button onClick={saveRename}>Save</Button>
          </>
        }
      >
        <Field label="Category name" htmlFor="ren-cat">
          <Input id="ren-cat" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
        </Field>
      </Modal>

      {/* add subcategory modal */}
      <Modal
        open={!!addSub}
        onClose={() => setAddSub(null)}
        title={`Add subcategory to ${addSub?.name ?? ''}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddSub(null)}>Cancel</Button>
            <Button onClick={addSubcategory}>Add</Button>
          </>
        }
      >
        <Field label="Subcategory name" htmlFor="new-sub">
          <Input id="new-sub" value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="e.g. Veg" />
        </Field>
      </Modal>

      {/* rename subcategory modal */}
      <Modal
        open={!!renameSub}
        onClose={() => setRenameSub(null)}
        title="Rename subcategory"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenameSub(null)}>Cancel</Button>
            <Button onClick={saveRenameSub}>Save</Button>
          </>
        }
      >
        <Field label="Subcategory name" htmlFor="ren-sub">
          <Input id="ren-sub" value={renameSubValue} onChange={(e) => setRenameSubValue(e.target.value)} />
        </Field>
      </Modal>

      <ItemFormModal
        open={!!itemModal}
        item={itemModal?.item}
        defaultCategoryId={itemModal?.categoryId}
        categories={sortedCats}
        subcategories={subcategories}
        onClose={() => setItemModal(null)}
        onSubmit={submitItem}
      />

      <ConfirmDialog
        open={!!confirm}
        title={
          confirm?.kind === 'category'
            ? 'Delete category'
            : confirm?.kind === 'subcategory'
            ? 'Delete subcategory'
            : 'Delete item'
        }
        message={
          confirm?.kind === 'category'
            ? `Delete "${confirm?.name}"? All subcategories and items in it will be removed too. Past orders are not affected.`
            : confirm?.kind === 'subcategory'
            ? `Delete "${confirm?.name}"? Items in it will move to "(No subcategory)". Past orders are not affected.`
            : `Delete "${confirm?.name}" from the menu? Past orders are not affected.`
        }
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}