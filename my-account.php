<?php
require_once __DIR__ . '/includes/layout.php';

$customer = current_customer();
if (!$customer) {
    header('Location: login.php');
    exit;
}

$ordersStmt = db()->prepare(
    'SELECT * FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 20'
);
$ordersStmt->execute([$customer['id']]);
$orders = $ordersStmt->fetchAll();

$itemsStmt = db()->prepare(
    'SELECT item_name, qty FROM order_items WHERE order_id = ? ORDER BY id'
);

$addrStmt = db()->prepare(
    'SELECT * FROM addresses WHERE customer_id = ? ORDER BY is_default DESC, id'
);
$addrStmt->execute([$customer['id']]);
$addresses = $addrStmt->fetchAll();

page_header([
    'title' => 'My Account — Vaatsalya Kitchens',
    'nav'   => [['order.php', 'Order Again'], ['login.php?action=logout', 'Sign Out']],
]);
?>

  <main class="container">
    <div class="order-header">
      <h1>Namaste, <?= e(explode(' ', trim($customer['name']))[0]) ?> 🙏</h1>
      <p class="section-sub">Your orders, addresses and PIN — all in one place.</p>
    </div>

    <!-- Orders -->
    <section class="account-section">
      <h2 class="order-step-title"><span class="num" aria-hidden="true">🧾</span> My orders</h2>
      <?php if (!$orders): ?>
        <p>No orders yet. <a href="order.php">Place your first order</a> — it takes two minutes!</p>
      <?php endif; ?>
      <?php foreach ($orders as $order): ?>
        <?php
          $itemsStmt->execute([$order['id']]);
          $names = array_map(
              fn($r) => $r['item_name'] . ' × ' . $r['qty'],
              $itemsStmt->fetchAll()
          );
        ?>
        <div class="order-history-item">
          <div class="order-line">
            <span>Order #<?= (int)$order['id'] ?> · <?= e(date('j M Y', strtotime($order['created_at']))) ?></span>
            <span><span class="status-chip status-<?= e($order['status']) ?>"><?= e(status_label($order['status'])) ?></span>
                  <?= rupees((float)$order['total_estimate']) ?></span>
          </div>
          <p class="hint"><?= e(implode(', ', $names)) ?></p>
        </div>
      <?php endforeach; ?>
    </section>

    <!-- Addresses -->
    <section class="account-section">
      <h2 class="order-step-title"><span class="num" aria-hidden="true">🏠</span> My addresses</h2>
      <div id="address-list">
        <?php foreach ($addresses as $addr): ?>
          <div class="order-history-item" data-id="<?= (int)$addr['id'] ?>">
            <div class="order-line">
              <span><?= e($addr['label']) ?> <?= $addr['is_default'] ? '<span class="status-chip status-confirmed">Default</span>' : '' ?></span>
              <span>
                <?php if (!$addr['is_default']): ?>
                  <button class="btn-link addr-default" type="button">Make default</button> ·
                <?php endif; ?>
                <button class="btn-link addr-delete" type="button">Remove</button>
              </span>
            </div>
            <p class="hint"><?= e($addr['address_text']) ?></p>
          </div>
        <?php endforeach; ?>
      </div>

      <div class="nice-box">
        <h3>Add a new address</h3>
        <form id="address-form" class="order-form">
          <label for="addr-label">Name for this address</label>
          <input id="addr-label" type="text" maxlength="40" placeholder="e.g. Home, Office, Daughter's place" />
          <button type="button" id="use-location" class="btn btn-maroon location-btn">📍 Use my current location</button>
          <p id="location-status" class="hint" aria-live="polite"></p>
          <label for="address">Full address</label>
          <textarea id="address" rows="3" placeholder="House no., street, area…"></textarea>
          <input type="hidden" id="lat" /><input type="hidden" id="lng" />
          <button type="submit" class="btn btn-primary" style="margin-top:1rem">Save address</button>
        </form>
        <p id="addr-status" class="hint" aria-live="polite"></p>
      </div>
    </section>

    <!-- PIN -->
    <section class="account-section">
      <h2 class="order-step-title"><span class="num" aria-hidden="true">🔑</span> My PIN</h2>
      <div class="nice-box">
        <p><?= $customer['pin_hash']
              ? 'You have a PIN. You can change it any time:'
              : 'You have no PIN yet. Set one to sign in from any other device with just your phone number:' ?></p>
        <form id="pin-form" class="order-form pin-form">
          <label for="pin" class="sr-only">New 4-digit PIN</label>
          <input id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}"
                 maxlength="4" placeholder="4 digits" autocomplete="new-password" />
          <button type="submit" class="btn btn-maroon"><?= $customer['pin_hash'] ? 'Change PIN' : 'Save PIN' ?></button>
        </form>
        <p id="pin-status" class="hint" aria-live="polite"></p>
      </div>
    </section>
  </main>

<?php page_footer(['js/geolocation.js', 'js/account.js']); ?>
