import { MenuManager } from '../components/MenuManager';

export function AdminMenu() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-900">Menu</h1>
      <p className="text-sm text-brand-500">Add, edit, price, reorder, and toggle availability. Changes show on the storefront instantly.</p>
      <div className="mt-4">
        <MenuManager />
      </div>
    </div>
  );
}