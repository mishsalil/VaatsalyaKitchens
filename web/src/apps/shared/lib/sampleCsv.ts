import { toCSV } from './csv';

/**
 * Sample CSV strings shown/downloaded from the import modals, so admins see the
 * exact expected format before importing. The menu sample uses the new columns
 * (category, subcategory, item, price, unit, available, variants, addons):
 *   variants cell = pipe-joined "name:delta" with a `*` marking the default
 *   addons cell   = pipe-joined "name:price"
 * Empty cells mean "none".
 */

export function sampleMenuCsv(): string {
  const rows = [
    { category: 'Starters', subcategory: 'Veg', item: 'Paneer Tikka', price: 350, unit: 'per plate', available: 'yes', variants: 'Half:-70|Full:*+150', addons: 'Cheese:40|Cashews:60' },
    { category: 'Starters', subcategory: 'Veg', item: 'Hara Bhara Kabab', price: 280, unit: 'per plate', available: 'yes', variants: '', addons: '' },
    { category: 'Starters', subcategory: 'Non-Veg', item: 'Chicken 65', price: 320, unit: 'per plate', available: 'yes', variants: 'Half:-80|Full:*+120', addons: '' },
    { category: 'Main Course', subcategory: '', item: 'Dal Makhani', price: 260, unit: 'per bowl', available: 'yes', variants: '', addons: '' },
    { category: 'Beverages', subcategory: '', item: 'Masala Chai', price: 40, unit: 'per cup', available: 'yes', variants: '', addons: '' },
  ];
  return toCSV(rows);
}

export function sampleCustomersCsv(): string {
  const rows = [
    { name: 'Anita Rao', phone: '9876543210', email: 'anita@example.com' },
    { name: 'Vikram Singh', phone: '9123456780', email: '' },
  ];
  return toCSV(rows);
}