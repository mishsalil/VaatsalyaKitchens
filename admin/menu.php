<?php
require_once __DIR__ . '/../includes/admin_auth.php';
require_admin();

$pdo = db();
$flash = '';
$flashErr = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf_form();
    $action = $_POST['action'] ?? '';

    try {
        if ($action === 'add_category') {
            $name = mb_substr(trim((string)$_POST['name']), 0, 120);
            if ($name === '') throw new RuntimeException('Category name is required.');
            $pdo->prepare('INSERT INTO menu_categories (name, sort_order) VALUES (?, ?)')
                ->execute([$name, (int)($_POST['sort_order'] ?? 0)]);
            $flash = 'Category added.';
        } elseif ($action === 'toggle_category') {
            $pdo->prepare('UPDATE menu_categories SET active = 1 - active WHERE id = ?')
                ->execute([(int)$_POST['id']]);
            $flash = 'Category updated.';
        } elseif ($action === 'add_item') {
            $name = mb_substr(trim((string)$_POST['name']), 0, 160);
            $price = (float)($_POST['price'] ?? 0);
            if ($name === '' || $price <= 0) throw new RuntimeException('Item needs a name and a price.');
            $pdo->prepare('INSERT INTO menu_items (category_id, name, price, unit, sort_order) VALUES (?, ?, ?, ?, ?)')
                ->execute([(int)$_POST['category_id'], $name, $price,
                           mb_substr(trim((string)($_POST['unit'] ?? '')), 0, 60),
                           (int)($_POST['sort_order'] ?? 0)]);
            $flash = 'Item added.';
        } elseif ($action === 'update_item') {
            $name = mb_substr(trim((string)$_POST['name']), 0, 160);
            $price = (float)($_POST['price'] ?? 0);
            if ($name === '' || $price <= 0) throw new RuntimeException('Item needs a name and a price.');
            $pdo->prepare('UPDATE menu_items SET name = ?, price = ?, unit = ? WHERE id = ?')
                ->execute([$name, $price,
                           mb_substr(trim((string)($_POST['unit'] ?? '')), 0, 60),
                           (int)$_POST['id']]);
            $flash = 'Item updated.';
        } elseif ($action === 'toggle_item') {
            $pdo->prepare('UPDATE menu_items SET available = 1 - available WHERE id = ?')
                ->execute([(int)$_POST['id']]);
            $flash = 'Item updated.';
        } elseif ($action === 'delete_item') {
            $pdo->prepare('DELETE FROM menu_items WHERE id = ?')->execute([(int)$_POST['id']]);
            $flash = 'Item removed. (Past orders keep their own copy of item details.)';
        }
    } catch (RuntimeException $e) {
        $flashErr = $e->getMessage();
    }
}

$categories = $pdo->query('SELECT * FROM menu_categories ORDER BY sort_order, id')->fetchAll();
$itemStmt = $pdo->prepare('SELECT * FROM menu_items WHERE category_id = ? ORDER BY sort_order, id');

admin_header('Menu', 'menu.php');
?>
  <h1>Menu editor</h1>
  <p class="muted">Changes appear on the order page immediately. "Hide" makes an item temporarily unavailable without deleting it.</p>
  <?php if ($flash): ?><p class="flash-ok"><?= e($flash) ?></p><?php endif; ?>
  <?php if ($flashErr): ?><p class="flash-err"><?= e($flashErr) ?></p><?php endif; ?>

  <?php foreach ($categories as $cat): ?>
    <h2><?= e($cat['name']) ?>
      <?php if (!$cat['active']): ?><span class="status-chip status-cancelled">Hidden</span><?php endif; ?>
      <form method="post" class="inline-form">
        <?= csrf_field() ?>
        <input type="hidden" name="action" value="toggle_category" />
        <input type="hidden" name="id" value="<?= (int)$cat['id'] ?>" />
        <button class="btn-link"><?= $cat['active'] ? 'Hide category' : 'Show category' ?></button>
      </form>
    </h2>

    <?php $itemStmt->execute([$cat['id']]); $catItems = $itemStmt->fetchAll(); ?>
    <?php foreach ($catItems as $it): ?>
      <form method="post" class="menu-edit-grid" style="margin-bottom:0.5rem">
        <?= csrf_field() ?>
        <input type="hidden" name="id" value="<?= (int)$it['id'] ?>" />
        <input type="text" name="name" value="<?= e($it['name']) ?>" aria-label="Item name" />
        <input type="number" name="price" value="<?= e($it['price']) ?>" min="1" step="0.01" aria-label="Price (₹)" />
        <input type="text" name="unit" value="<?= e($it['unit']) ?>" aria-label="Unit" placeholder="per kg / per plate…" />
        <button class="btn btn-primary" name="action" value="update_item">Save</button>
        <span>
          <button class="btn-link" name="action" value="toggle_item"><?= $it['available'] ? 'Hide' : 'Show' ?></button> ·
          <button class="btn-link" name="action" value="delete_item"
                  onclick="return confirm('Delete <?= e(addslashes($it['name'])) ?>?')">Delete</button>
          <?php if (!$it['available']): ?><span class="status-chip status-cancelled">Hidden</span><?php endif; ?>
        </span>
      </form>
    <?php endforeach; ?>

    <details style="margin:0.6rem 0 1.6rem">
      <summary class="muted" style="cursor:pointer">➕ Add item to <?= e($cat['name']) ?></summary>
      <form method="post" class="menu-edit-grid" style="margin-top:0.6rem">
        <?= csrf_field() ?>
        <input type="hidden" name="action" value="add_item" />
        <input type="hidden" name="category_id" value="<?= (int)$cat['id'] ?>" />
        <input type="text" name="name" placeholder="Item name" required />
        <input type="number" name="price" placeholder="Price ₹" min="1" step="0.01" required />
        <input type="text" name="unit" placeholder="per kg / per plate…" />
        <button class="btn btn-primary">Add</button>
        <span></span>
      </form>
    </details>
  <?php endforeach; ?>

  <h2>Add a new category</h2>
  <form method="post" class="filter-bar">
    <?= csrf_field() ?>
    <input type="hidden" name="action" value="add_category" />
    <input type="text" name="name" placeholder="e.g. Festive Specials" required />
    <button class="btn btn-primary">Add category</button>
  </form>
<?php admin_footer(); ?>
