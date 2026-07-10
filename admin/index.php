<?php
require_once __DIR__ . '/../includes/admin_auth.php';
require_admin();

$pdo = db();
$todayOrders   = (int)$pdo->query("SELECT COUNT(*) c FROM orders WHERE DATE(created_at) = CURDATE()")->fetch()['c'];
$todayRevenue  = (float)$pdo->query("SELECT COALESCE(SUM(total_estimate),0) s FROM orders WHERE DATE(created_at) = CURDATE() AND status <> 'cancelled'")->fetch()['s'];
$newOrders     = (int)$pdo->query("SELECT COUNT(*) c FROM orders WHERE status = 'new'")->fetch()['c'];
$totalCustomers= (int)$pdo->query("SELECT COUNT(*) c FROM customers")->fetch()['c'];
$pushSubs      = (int)$pdo->query("SELECT COUNT(*) c FROM push_subscriptions")->fetch()['c'];

$pending = $pdo->query(
    "SELECT o.*, (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) item_count
       FROM orders o
      WHERE o.status IN ('new','confirmed','preparing','out_for_delivery')
      ORDER BY o.id DESC LIMIT 25"
)->fetchAll();

admin_header('Dashboard', 'index.php');
?>
  <h1>Dashboard <span class="muted" style="font-size:1rem">(refreshes every 30 seconds)</span></h1>

  <div class="stat-row">
    <div class="stat-tile"><div class="stat-num"><?= $newOrders ?></div><div class="stat-label">New orders waiting</div></div>
    <div class="stat-tile"><div class="stat-num"><?= $todayOrders ?></div><div class="stat-label">Orders today</div></div>
    <div class="stat-tile"><div class="stat-num"><?= rupees($todayRevenue) ?></div><div class="stat-label">Estimated revenue today</div></div>
    <div class="stat-tile"><div class="stat-num"><?= $totalCustomers ?></div><div class="stat-label">Registered customers</div></div>
    <div class="stat-tile"><div class="stat-num"><?= $pushSubs ?></div><div class="stat-label">Push subscribers</div></div>
  </div>

  <h2>Orders in progress</h2>
  <?php if (!$pending): ?>
    <p class="muted">No open orders right now. 🎉</p>
  <?php else: ?>
  <div class="admin-table-wrap">
    <table class="admin-table">
      <thead><tr><th>#</th><th>Placed</th><th>Customer</th><th>Items</th><th>Needed on</th><th>Total</th><th>Status</th></tr></thead>
      <tbody>
        <?php foreach ($pending as $o): ?>
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

  <script>setTimeout(function () { window.location.reload(); }, 30000);</script>
<?php admin_footer(); ?>
