<?php
require_once __DIR__ . '/includes/layout.php';

$cfg = config();

if (($_GET['action'] ?? '') === 'logout') {
    logout_customer();
    header('Location: index.php');
    exit;
}

if (current_customer()) {
    header('Location: my-account.php');
    exit;
}

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf_form();

    $phone = normalize_phone((string)($_POST['phone'] ?? ''));
    $pin   = trim((string)($_POST['pin'] ?? ''));

    if ($phone === null) {
        $error = 'Please write your 10-digit phone number.';
    } elseif (!preg_match('/^\d{4}$/', $pin)) {
        $error = 'Please write your 4-digit PIN.';
    } elseif (too_many_attempts('pin:' . $phone)) {
        $error = 'Too many tries. Please wait 15 minutes and try again, or call us — we can help.';
    } else {
        $customer = find_customer_by_phone($phone);
        if ($customer && $customer['pin_hash'] && password_verify($pin, $customer['pin_hash'])) {
            clear_attempts('pin:' . $phone);
            login_customer((int)$customer['id']);
            header('Location: my-account.php');
            exit;
        }
        record_attempt('pin:' . $phone);
        if ($customer && !$customer['pin_hash']) {
            $error = 'This number has no PIN yet. Just place an order — this device will remember you, and you can set a PIN afterwards.';
        } else {
            $error = 'That phone number and PIN do not match. Please try again.';
        }
    }
}

page_header(['title' => 'Sign In — Vaatsalya Kitchens', 'nav' => [['index.php', '← Back to Home']]]);
?>

  <main class="container narrow">
    <div class="order-header">
      <h1>Sign In</h1>
      <p class="section-sub">Ordered from this phone before? You are probably already signed in —
        just go to <a href="order.php">the order page</a>. Use this form only on a new device.</p>
    </div>

    <?php if ($error): ?>
      <p class="error-msg" role="alert"><?= e($error) ?></p>
    <?php endif; ?>

    <form method="post" class="order-form nice-box" style="max-width:480px;margin:0 auto 3rem">
      <?= csrf_field() ?>
      <label for="phone">Phone number</label>
      <input id="phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel"
             placeholder="e.g. 98765 43210" required value="<?= e($_POST['phone'] ?? '') ?>" />

      <label for="pin">Your 4-digit PIN</label>
      <input id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}"
             maxlength="4" placeholder="••••" required autocomplete="current-password" />

      <button type="submit" class="btn btn-primary btn-big" style="margin-top:1.4rem">Sign In</button>
      <p class="hint" style="margin-top:1rem">Forgot your PIN? Call us at
        <a href="tel:+<?= e($cfg['kitchen_whatsapp']) ?>"><?= e($cfg['kitchen_phone_display']) ?></a>
        and we will reset it for you.</p>
    </form>
  </main>

<?php page_footer(); ?>
