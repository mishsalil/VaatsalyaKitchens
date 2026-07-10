<?php
require_once __DIR__ . '/includes/layout.php';

$cfg = config();
$customer = current_customer();
if (!$customer) {
    header('Location: order.php');
    exit;
}

// Only the customer who placed the order (this session) may view it
$orderId = (int)($_GET['o'] ?? 0);
$stmt = db()->prepare('SELECT * FROM orders WHERE id = ? AND customer_id = ?');
$stmt->execute([$orderId, $customer['id']]);
$order = $stmt->fetch();
if (!$order) {
    header('Location: order.php');
    exit;
}

$itemsStmt = db()->prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id');
$itemsStmt->execute([$orderId]);
$items = $itemsStmt->fetchAll();

// Build the WhatsApp message (same friendly format as before, now with order no.)
$lines = ["Namaste Vaatsalya Kitchens! I have placed order #{$orderId} on the website:", ''];
foreach ($items as $it) {
    $lines[] = '• ' . $it['item_name'] . ' — ' . $it['qty'] . ' (' . $it['unit'] . ')';
}
$lines[] = '';
$lines[] = 'Estimated total: ₹' . number_format((float)$order['total_estimate']);
$lines[] = '';
$lines[] = 'Name: ' . $order['name'];
$lines[] = 'Phone: ' . display_phone($order['phone']);
if ($order['occasion']) $lines[] = 'Occasion: ' . $order['occasion'];
$lines[] = 'Needed on: ' . $order['needed_on'];
$lines[] = $order['address_text'] ? 'Delivery address: ' . $order['address_text'] : 'Pickup order';
if ($order['notes']) $lines[] = 'Notes: ' . $order['notes'];
$waUrl = 'https://wa.me/' . $cfg['kitchen_whatsapp'] . '?text=' . rawurlencode(implode("\n", $lines));

page_header([
    'title' => 'Order Placed — Vaatsalya Kitchens',
    'nav'   => [['index.php', '← Back to Home']],
]);
?>

  <main class="container">
    <div class="order-header">
      <div class="success-badge" aria-hidden="true">✅</div>
      <h1>Thank you, <?= e(explode(' ', trim($order['name']))[0]) ?>!</h1>
      <p class="section-sub">Your order <strong>#<?= $orderId ?></strong> is saved with us.
        We will call you on <strong><?= e(display_phone($order['phone'])) ?></strong> to confirm it shortly.</p>
    </div>

    <div class="summary-box">
      <h3>Order #<?= $orderId ?> — <?= e(status_label($order['status'])) ?></h3>
      <ul id="summary-list">
        <?php foreach ($items as $it): ?>
          <li><span><?= e($it['item_name']) ?> × <?= (int)$it['qty'] ?></span>
              <span><?= rupees((float)$it['price'] * (int)$it['qty']) ?></span></li>
        <?php endforeach; ?>
      </ul>
      <p class="summary-total"><span>Estimated total</span> <span><?= rupees((float)$order['total_estimate']) ?></span></p>
      <p class="hint">Needed on: <?= e($order['needed_on']) ?>
        · <?= $order['address_text'] ? 'Delivery to: ' . e($order['address_text']) : 'Pickup order' ?></p>
    </div>

    <div class="order-actions">
      <a class="btn btn-whatsapp btn-big" href="<?= e($waUrl) ?>" target="_blank" rel="noopener">
        💬 Also send it to us on WhatsApp (recommended)
      </a>
      <a class="btn btn-maroon btn-big" href="my-account.php">📋 See my orders &amp; addresses</a>
    </div>

    <!-- Push notification opt-in -->
    <div id="push-box" class="nice-box" hidden>
      <h3>🔔 Get updates about your order?</h3>
      <p>We can notify you right on this device when your order is confirmed and when it is on its way. No app needed.</p>
      <button id="enable-push" class="btn btn-primary">Yes, notify me</button>
      <p id="push-status" class="hint" aria-live="polite"></p>
    </div>

    <?php if (empty($customer['pin_hash'])): ?>
    <!-- Optional PIN setup -->
    <div class="nice-box">
      <h3>🔑 Set a 4-digit PIN <span class="hint">(optional, 10 seconds)</span></h3>
      <p>We already remember you on this phone. A PIN lets you sign in from any other device
         with just your phone number — to reorder in two taps and see your order history.</p>
      <form id="pin-form" class="order-form pin-form">
        <label for="pin" class="sr-only">Choose a 4-digit PIN</label>
        <input id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}"
               maxlength="4" placeholder="4 digits, e.g. 2810" autocomplete="new-password" />
        <button type="submit" class="btn btn-maroon">Save PIN</button>
      </form>
      <p id="pin-status" class="hint" aria-live="polite"></p>
    </div>
    <?php endif; ?>
  </main>

<?php page_footer(['js/push-client.js', 'js/account.js']); ?>
