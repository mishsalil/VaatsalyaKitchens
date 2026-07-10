<?php
require_once __DIR__ . '/../includes/admin_auth.php';
require_once __DIR__ . '/../includes/push.php';
require_admin();

$flash = '';
$flashErr = '';
$subCount = (int)db()->query('SELECT COUNT(*) c FROM push_subscriptions')->fetch()['c'];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf_form();
    $title = mb_substr(trim((string)($_POST['title'] ?? '')), 0, 80);
    $body  = mb_substr(trim((string)($_POST['body'] ?? '')), 0, 300);

    if (!push_configured()) {
        $flashErr = 'Push is not set up yet — add your VAPID keys in includes/config.php first (see README).';
    } elseif ($title === '' || $body === '') {
        $flashErr = 'Please write both a title and a message.';
    } else {
        [$sent, $failed] = push_send_broadcast($title, $body, config()['base_url'] . '/order.php');
        $flash = "Sent to {$sent} device(s)." . ($failed ? " {$failed} failed (expired subscriptions are cleaned automatically)." : '');
    }
}

admin_header('Broadcast', 'broadcast.php');
?>
  <h1>Broadcast a notification</h1>
  <p class="muted">Goes to every device that allowed notifications — currently <strong><?= $subCount ?></strong>.
     Great for weekly specials or festival menus. Please don't send more than one or two a week, or people will switch them off.</p>

  <?php if ($flash): ?><p class="flash-ok"><?= e($flash) ?></p><?php endif; ?>
  <?php if ($flashErr): ?><p class="flash-err"><?= e($flashErr) ?></p><?php endif; ?>

  <form method="post" class="admin-form">
    <?= csrf_field() ?>
    <label for="title">Title</label>
    <input id="title" name="title" type="text" maxlength="80" required
           placeholder="e.g. Weekend Special: Chole Bhature!" />
    <label for="body">Message</label>
    <textarea id="body" name="body" rows="3" maxlength="300" required
              placeholder="e.g. Order today for Sunday delivery. Fresh, hot and home-style. 🙏"></textarea>
    <button type="submit" class="btn btn-primary btn-big" style="margin-top:1.2rem"
            onclick="return confirm('Send this to all <?= $subCount ?> subscribed devices?')">🔔 Send now</button>
  </form>
<?php admin_footer(); ?>
