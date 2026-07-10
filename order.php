<?php
require_once __DIR__ . '/includes/layout.php';

$cfg = config();
$customer = current_customer();

// Menu: active categories with available items
$categories = db()->query(
    'SELECT id, name FROM menu_categories WHERE active = 1 ORDER BY sort_order, id'
)->fetchAll();
$itemStmt = db()->prepare(
    'SELECT id, name, price, unit FROM menu_items
      WHERE category_id = ? AND available = 1 ORDER BY sort_order, id'
);

// Saved addresses for logged-in customers
$addresses = [];
if ($customer) {
    $stmt = db()->prepare(
        'SELECT id, label, address_text FROM addresses
          WHERE customer_id = ? ORDER BY is_default DESC, id'
    );
    $stmt->execute([$customer['id']]);
    $addresses = $stmt->fetchAll();
}

page_header([
    'title' => 'Order — Vaatsalya Kitchens',
    'nav'   => [['index.php', '← Back to Home']],
]);
?>

  <main class="container">
    <div class="order-header">
      <h1>Place Your Order</h1>
      <p class="section-sub">Just three easy steps. If anything is confusing, simply call us at
        <a href="tel:+<?= e($cfg['kitchen_whatsapp']) ?>"><strong><?= e($cfg['kitchen_phone_display']) ?></strong></a>
        — we will take your order on the phone with a smile.</p>
      <?php if ($customer): ?>
        <p class="welcome-back">🙏 Welcome back, <strong><?= e($customer['name']) ?></strong>! Your details are already filled in below.</p>
      <?php endif; ?>
    </div>

    <!-- Step 1: choose dishes -->
    <h2 class="order-step-title"><span class="num" aria-hidden="true">1</span> Choose your dishes</h2>
    <p class="hint">Use the <strong>+</strong> and <strong>−</strong> buttons to set how many you want.</p>

    <?php foreach ($categories as $cat): ?>
      <?php $itemStmt->execute([$cat['id']]); $items = $itemStmt->fetchAll(); ?>
      <?php if (!$items) continue; ?>
      <section class="menu-category">
        <h3><?= e($cat['name']) ?></h3>
        <?php foreach ($items as $item): ?>
          <div class="menu-item" data-id="<?= (int)$item['id'] ?>" data-name="<?= e($item['name']) ?>"
               data-price="<?= e($item['price']) ?>" data-unit="<?= e($item['unit']) ?>">
            <div class="item-info">
              <div class="item-name"><?= e($item['name']) ?></div>
              <div class="item-price"><?= rupees((float)$item['price']) ?> <?= e($item['unit']) ?></div>
            </div>
            <div class="qty-control">
              <button type="button" class="qty-minus" aria-label="Remove one <?= e($item['name']) ?>">−</button>
              <span class="qty" aria-live="polite">0</span>
              <button type="button" class="qty-plus" aria-label="Add one <?= e($item['name']) ?>">+</button>
            </div>
          </div>
        <?php endforeach; ?>
      </section>
    <?php endforeach; ?>

    <!-- Step 2: details -->
    <h2 class="order-step-title"><span class="num" aria-hidden="true">2</span> Tell us about yourself</h2>
    <form id="order-form" class="order-form">
      <label for="cust-name">Your name</label>
      <input id="cust-name" name="name" type="text" autocomplete="name"
             placeholder="e.g. Sunita Sharma" required value="<?= e($customer['name'] ?? '') ?>" />

      <label for="cust-phone">Phone number</label>
      <input id="cust-phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel"
             placeholder="e.g. 98765 43210" required
             value="<?= $customer ? e(display_phone($customer['phone'])) : '' ?>" />

      <label for="occasion">What is the occasion? <span class="hint">(optional)</span></label>
      <select id="occasion" name="occasion">
        <option value="">Choose one…</option>
        <option>Small Party</option>
        <option>Kitty Party</option>
        <option>Bulk Order / Event</option>
        <option>Daily Meal</option>
        <option>Other</option>
      </select>

      <label for="when">When do you need the food?</label>
      <input id="when" name="when" type="text" placeholder="e.g. Saturday 20 July, 1 PM" required />

      <fieldset class="address-block">
        <legend>Delivery address <span class="hint">(leave blank for pickup)</span></legend>

        <?php if ($addresses): ?>
          <div class="saved-addresses" role="radiogroup" aria-label="Saved addresses">
            <?php foreach ($addresses as $i => $addr): ?>
              <label class="saved-address">
                <input type="radio" name="address_choice" value="<?= (int)$addr['id'] ?>" <?= $i === 0 ? 'checked' : '' ?> />
                <span><strong><?= e($addr['label']) ?>:</strong> <?= e($addr['address_text']) ?></span>
              </label>
            <?php endforeach; ?>
            <label class="saved-address">
              <input type="radio" name="address_choice" value="new" />
              <span><strong>➕ Use a different address</strong></span>
            </label>
            <label class="saved-address">
              <input type="radio" name="address_choice" value="pickup" />
              <span><strong>🏪 No delivery — I will pick up</strong></span>
            </label>
          </div>
        <?php endif; ?>

        <div id="new-address-fields" <?= $addresses ? 'hidden' : '' ?>>
          <button type="button" id="use-location" class="btn btn-maroon location-btn">📍 Use my current location</button>
          <p id="location-status" class="hint" aria-live="polite"></p>
          <label for="address" class="sr-only">Address</label>
          <textarea id="address" name="address" rows="3" placeholder="House no., street, area…"></textarea>
          <input type="hidden" id="lat" name="lat" />
          <input type="hidden" id="lng" name="lng" />
        </div>
      </fieldset>

      <label for="notes">Anything else we should know? <span class="hint">(less spicy, no onion-garlic, etc.)</span></label>
      <textarea id="notes" name="notes" rows="2"></textarea>
    </form>

    <!-- Step 3: review & send -->
    <h2 class="order-step-title"><span class="num" aria-hidden="true">3</span> Review and place your order</h2>
    <div class="summary-box" aria-live="polite">
      <h3>Your order so far</h3>
      <ul id="summary-list"><li>Nothing selected yet — use the + buttons above.</li></ul>
      <p class="summary-total"><span>Estimated total</span> <span id="summary-total">₹0</span></p>
      <p class="hint">Final price is confirmed by us on the phone — delivery charges may apply.</p>
    </div>

    <p id="order-error" class="error-msg" role="alert"></p>

    <div class="order-actions">
      <button id="place-order" class="btn btn-primary btn-big" type="button">🍽️ Place Order</button>
      <a class="btn btn-maroon btn-big" href="tel:+<?= e($cfg['kitchen_whatsapp']) ?>">📞 Prefer talking? Call us instead</a>
    </div>
  </main>

<?php page_footer(['js/geolocation.js', 'js/order.js']); ?>
