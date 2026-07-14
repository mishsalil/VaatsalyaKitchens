# Dish photos

Drop a photo for each menu item here, named by the item's database id.

- Preferred: `{id}.webp` (e.g. `1.webp`)
- Fallback:    `{id}.jpg` (e.g. `1.jpg`)

The SPA's `DishImage` component tries `/menu/{id}.webp`, then `/menu/{id}.jpg`,
and finally an elegant cream fallback tile — so the app looks finished even
before photos are added, and improves automatically as you drop files in.

No database, API, or admin change is needed. Vite copies `public/` into the
build output (`dist/`), so photos are served as static files.

## Finding item ids

Run from the repo root (`C:\Users\kulka\VaatsalyaKitchens`):

```bash
/c/xampp/mysql/bin/mysql.exe -u root vaatsalya_kitchens \
  -e "SELECT id, name FROM menu_items ORDER BY id;"
```

Then name your photos to match (e.g. item id 3 → `3.webp`).