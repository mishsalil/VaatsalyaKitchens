<?php
require_once __DIR__ . '/../includes/admin_auth.php';
require_once __DIR__ . '/../includes/push.php';
require_admin();

$pdo = db();
$cfg = config();
$flash = '';
$flashErr = '';

// --- Status change ---
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['set_status'], $_POST['order_id'])) {
    require_csrf_form();
    $orderId = (int)$_POST['order_id'];
    $status  = (string)$_POST['set_status'];
    $allowed = ['new','confirmed','preparing','out_for_delivery','delivered','cancelled'];
    if (in_array($status, $allowed, true)) {
        $stmt = $pdo->prepare('SELECT * FROM orders WHERE id = ?');
        $stmt->execute([$orderId]);
        if ($order = $stmt->fetch()) {
            $pdo->prepare('UPDATE orders SET status = ? WHERE id = ?')->execute([$status, $orderId]);
            $flash = "Order #{$orderId} marked as " . status_label($status) . '.';

            // Notify the customer on their device(s)
            if ($order['customer_id']) {
                $messages = [
                    'confirmed'        => 'Your order #%d is confirmed! We are on it. 🍳',
                    'preparing'        => 'Your order #%d is being freshly prepared. 🥘',
                    'out_for_delivery' => 'Your order #%d is on its way to you! 🛵',
                    'delivered'        => 'Your order #%d is delivered. Enjoy the meal! 🙏',
                    'cancelled'        => 'Your order #%d was cancelled. Call us if this is a surprise.',
                ];
                if (isset($messages[$status]) && push_configured()) {
                    [$sent] = push_send_to_customer(
                        (int)$order['customer_id'],
                        'Vaatsalya Kitchens',
                        sprintf($messages[$status], $orderId),
                        $cfg['base_url'] . '/my-account.php'
                    );
                    if ($sent) {
                        $flash .= " Push notification sent.";
                    }
                }
            }
        }
    }
}

// --- Detail view ---
$order = null;
$items = [];
if (isset($_GET['id'])) {
    $stmt = $pdo->prepare('SELECT * FROM orders WHERE id = ?');
    $stmt->execute([(int)$_GET['id']]);
    $order = $stmt->fetch();
    if ($order) {
        $stmt = $pdo->prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id');
        $stmt->execute([$order['id']]);
        $items = $stmt->fetchAll();
    }
}

// --- List view ---
$filter = $_GET['status'] ?? 'open';
$filters = [
    'open'      => "status IN ('new','confirmed','preparing','out_for_delivery')",
    'new'       => "status = 'new'",
    'delivered' => "status = 'delivered'",
    'cancelled' => "status = 'cancelled'",
    'all'       => '1=1',
];
$where = $filters[$filter] ?? $filters['open'];
$orders = $pdo->query(
    "SELECT o.*, (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) item_count
       FROM orders o WHERE $where ORDER BY o.id DESC LIMIT 200"
)->fetchAll();

admin_header('Orders', 'orders.php');
?>
  <?php if ($flash): ?><p class="flash-ok"><?= e($flash) ?></p><?php endif; ?>
  <?php if ($flashErr): ?><p class="flash-err"><?= e($flashErr) ?></p><?php endif; ?>

  <?php if ($order): ?>
    <p><a href="orders.php">← All orders</a></p>
    <h1>Order #<?= (int)$order['id'] ?>
      <span class="status-chip status-<?= e($order['status']) ?>"><?= e(status_label($order['status'])) ?></span></h1>
    <p class="muted">Placed <?= e(date('j M Y, g:i A', strtotime($order['created_at']))) ?></p>

    <div class="stat-row">
      <div class="stat-tile">
        <div class="stat-label">Customer</div>
        <div><strong><?= e($order['name']) ?></strong><br>
          <a href="tel:+<?= e($order['phone']) ?>"><?= e(display_phone($order['phone'])) ?></a><br>
          <a href="https://wa.me/<?= e($order['phone']) ?>" target="_blank" rel="noopener">💬 WhatsApp them</a>
          <?php if ($order['customer_id']): ?>
            · <a href="customers.php?id=<?= (int)$order['customer_id'] ?>">profile</a>
          <?php endif; ?>
        </div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">Needed on</div>
        <div><strong><?= e($order['needed_on']) ?></strong>
          <?php if ($order['occasion']): ?><br>Occasion: <?= e($order['occasion']) ?><?php endif; ?></div>
      </div>
      <div class="stat-tile">
        <div class="stat-label"><?= $order['address_text'] ? 'Deliver to' : 'Pickup' ?></div>
        <div><?= $order['address_text'] ? e($order['address_text']) : 'Customer will pick up' ?>
          <?php if ($order['lat'] !== null && $order['lng'] !== null): ?>
            <br><a href="https://www.google.com/maps?q=<?= e($order['lat']) ?>,<?= e($order['lng']) ?>"
                   target="_blank" rel="noopener">🗺️ Open in Google Maps</a>
          <?php endif; ?>
        </div>
      </div>
    </div>

    <?php if ($order['notes']): ?><p><strong>Notes:</strong> <?= e($order['notes']) ?></p><?php endif; ?>

    <h2>Items</h2>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Item</th><th>Unit</th><th>Price</th><th>Qty</th><th>Line total</th></tr></thead>
        <tbody>
          <?php foreach ($items as $it): ?>
          <tr>
            <td><?= e($it['item_name']) ?></td>
            <td><?= e($it['unit']) ?></td>
            <td><?= rupees((float)$it['price']) ?></td>
            <td><?= (int)$it['qty'] ?></td>
            <td><?= rupees((float)$it['price'] * (int)$it['qty']) ?></td>
          </tr>
          <?php endforeach; ?>
          <tr><td colspan="4"><strong>Estimated total</strong></td>
              <td><strong><?= rupees((float)$order['total_estimate']) ?></strong></td></tr>
        </tbody>
      </table>
    </div>

    <h2>Change status <span class="muted">(customer gets a push notification)</span></h2>
    <form method="post" class="status-actions">
      <?= csrf_field() ?>
      <input type="hidden" name="order_id" value="<?= (int)$order['id'] ?>" />
      <button class="btn btn-primary"  name="set_status" value="confirmed">✅ Confirm</button>
      <button class="btn btn-primary"  name="set_status" value="preparing">🥘 Preparing</button>
      <button class="btn btn-primary"  name="set_status" value="out_for_delivery">🛵 Out for delivery</button>
      <button class="btn btn-whatsapp" name="set_status" value="delivered">🎉 Delivered</button>
      <button class="btn btn-maroon"   name="set_status" value="cancelled"
              onclick="return confirm('Cancel this order?')">✖ Cancel order</button>
    </form>

  <?php else: ?>
    <h1>Orders</h1>
    <div class="filter-bar">
      <?php foreach (['open' => 'Open', 'new' => 'New', 'delivered' => 'Delivered', 'cancelled' => 'Cancelled', 'all' => 'All'] as $key => $label): ?>
        <a class="btn <?= $filter === $key ? 'btn-maroon' : 'btn-primary' ?>" href="orders.php?status=<?= $key ?>"><?= $label ?></a>
      <?php endforeach; ?>
    </div>
    <?php if (!$orders): ?><p class="muted">No orders here yet.</p><?php else: ?>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>#</th><th>Placed</th><th>Customer</th><th>Items</th><th>Needed on</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>
          <?php foreach ($orders as $o): ?>
          <tr>
            <td><a href="orders.php?id=<?= (int)$o['id'] ?>"><strong>#<?= (int)$o['id'] ?></strong></a></td>
            <td><?= e(date('j M, g:i A', strtotime($o['created_at']))) ?></td>
            <td><?= e($o['name']) ?><br><span class="muted"><?= e(display_phone($o['phone'])) ?></span></td>
            <td><?= (int)$o['item_count'] ?></td>
            <td><?= e($o['needed_on']) ?></td>
            <td><?= rupees((float)$o['total_estimate']) ?></td>
            <td><span class="status-chip status-<?= e($o['status']) ?>"><?= e(status_label($o['status'])) ?></span></td>
          </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
    <?php endif; ?>
  <?php endif; ?>
<?php admin_footer(); ?>
