<?php
require_once __DIR__ . '/../includes/admin_auth.php';
require_admin();

$pdo = db();
$flash = '';

// Reset a customer's PIN (they can set a new one from their account page)
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'reset_pin') {
    require_csrf_form();
    $pdo->prepare('UPDATE customers SET pin_hash = NULL WHERE id = ?')
        ->execute([(int)$_POST['id']]);
    $flash = 'PIN removed. The customer can set a new one after their next order, or from My Account on a signed-in device.';
}

// --- Detail view ---
$customer = null;
if (isset($_GET['id'])) {
    $stmt = $pdo->prepare('SELECT * FROM customers WHERE id = ?');
    $stmt->execute([(int)$_GET['id']]);
    $customer = $stmt->fetch();
}

if ($customer) {
    $ordStmt = $pdo->prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 50');
    $ordStmt->execute([$customer['id']]);
    $custOrders = $ordStmt->fetchAll();
    $addrStmt = $pdo->prepare('SELECT * FROM addresses WHERE customer_id = ? ORDER BY is_default DESC, id');
    $addrStmt->execute([$customer['id']]);
    $custAddresses = $addrStmt->fetchAll();
} else {
    $q = trim((string)($_GET['q'] ?? ''));
    if ($q !== '') {
        $stmt = $pdo->prepare(
            'SELECT c.*, (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) order_count
               FROM customers c
              WHERE c.name LIKE ? OR c.phone LIKE ?
              ORDER BY c.last_order_at DESC LIMIT 100'
        );
        $like = '%' . $q . '%';
        $stmt->execute([$like, '%' . preg_replace('/\D+/', '', $q) . '%']);
        $customers = $stmt->fetchAll();
    } else {
        $customers = $pdo->query(
            'SELECT c.*, (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) order_count
               FROM customers c ORDER BY c.last_order_at DESC LIMIT 100'
        )->fetchAll();
    }
}

admin_header('Customers', 'customers.php');
?>
  <?php if ($flash): ?><p class="flash-ok"><?= e($flash) ?></p><?php endif; ?>

  <?php if ($customer): ?>
    <p><a href="customers.php">← All customers</a></p>
    <h1><?= e($customer['name']) ?></h1>
    <div class="stat-row">
      <div class="stat-tile">
        <div class="stat-label">Contact</div>
        <div><a href="tel:+<?= e($customer['phone']) ?>"><?= e(display_phone($customer['phone'])) ?></a><br>
          <a href="https://wa.me/<?= e($customer['phone']) ?>" target="_blank" rel="noopener">💬 WhatsApp them</a></div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">Customer since</div>
        <div><?= e(date('j M Y', strtotime($customer['created_at']))) ?></div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">Sign-in PIN</div>
        <div><?= $customer['pin_hash'] ? 'Set' : 'Not set' ?>
          <?php if ($customer['pin_hash']): ?>
          <form method="post" class="inline-form" onsubmit="return confirm('Remove this customer\'s PIN?')">
            <?= csrf_field() ?>
            <input type="hidden" name="action" value="reset_pin" />
            <input type="hidden" name="id" value="<?= (int)$customer['id'] ?>" />
            · <button class="btn-link">Reset PIN</button>
          </form>
          <?php endif; ?>
        </div>
      </div>
    </div>

    <h2>Addresses</h2>
    <?php if (!$custAddresses): ?><p class="muted">No saved addresses.</p><?php endif; ?>
    <?php foreach ($custAddresses as $a): ?>
      <p><strong><?= e($a['label']) ?><?= $a['is_default'] ? ' (default)' : '' ?>:</strong> <?= e($a['address_text']) ?>
        <?php if ($a['lat'] !== null): ?>
          — <a href="https://www.google.com/maps?q=<?= e($a['lat']) ?>,<?= e($a['lng']) ?>" target="_blank" rel="noopener">map</a>
        <?php endif; ?></p>
    <?php endforeach; ?>

    <h2>Orders (<?= count($custOrders) ?>)</h2>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>#</th><th>Placed</th><th>Needed on</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>
          <?php foreach ($custOrders as $o): ?>
          <tr>
            <td><a href="orders.php?id=<?= (int)$o['id'] ?>">#<?= (int)$o['id'] ?></a></td>
            <td><?= e(date('j M Y', strtotime($o['created_at']))) ?></td>
            <td><?= e($o['needed_on']) ?></td>
            <td><?= rupees((float)$o['total_estimate']) ?></td>
            <td><span class="status-chip status-<?= e($o['status']) ?>"><?= e(status_label($o['status'])) ?></span></td>
          </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>

  <?php else: ?>
    <h1>Customers</h1>
    <form method="get" class="filter-bar">
      <input type="search" name="q" placeholder="Search name or phone…" value="<?= e($_GET['q'] ?? '') ?>" />
      <button class="btn btn-primary">Search</button>
      <?php if (!empty($_GET['q'])): ?><a class="btn btn-maroon" href="customers.php">Clear</a><?php endif; ?>
    </form>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Name</th><th>Phone</th><th>Orders</th><th>Last order</th><th>PIN</th></tr></thead>
        <tbody>
          <?php foreach ($customers as $c): ?>
          <tr>
            <td><a href="customers.php?id=<?= (int)$c['id'] ?>"><strong><?= e($c['name']) ?></strong></a></td>
            <td><?= e(display_phone($c['phone'])) ?></td>
            <td><?= (int)$c['order_count'] ?></td>
            <td><?= $c['last_order_at'] ? e(date('j M Y', strtotime($c['last_order_at']))) : '—' ?></td>
            <td><?= $c['pin_hash'] ? 'Set' : '—' ?></td>
          </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  <?php endif; ?>
<?php admin_footer(); ?>
