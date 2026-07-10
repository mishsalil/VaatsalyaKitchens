<?php
require_once __DIR__ . '/../includes/admin_auth.php';
$admin = require_admin();

$flash = '';
$flashErr = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'change_password') {
    require_csrf_form();
    $current = (string)($_POST['current_password'] ?? '');
    $new     = (string)($_POST['new_password'] ?? '');
    $confirm = (string)($_POST['confirm_password'] ?? '');

    if (!password_verify($current, $admin['password_hash'])) {
        $flashErr = 'Your current password is wrong.';
    } elseif (strlen($new) < 8) {
        $flashErr = 'The new password must be at least 8 characters.';
    } elseif ($new !== $confirm) {
        $flashErr = 'The two new passwords do not match.';
    } else {
        db()->prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?')
            ->execute([password_hash($new, PASSWORD_DEFAULT), $admin['id']]);
        $flash = 'Password changed. Please use the new one next time you sign in.';
    }
}

admin_header('Settings', 'settings.php');
?>
  <h1>Settings</h1>
  <?php if ($flash): ?><p class="flash-ok"><?= e($flash) ?></p><?php endif; ?>
  <?php if ($flashErr): ?><p class="flash-err"><?= e($flashErr) ?></p><?php endif; ?>

  <h2>Change admin password</h2>
  <form method="post" class="admin-form">
    <?= csrf_field() ?>
    <input type="hidden" name="action" value="change_password" />
    <label for="current_password">Current password</label>
    <input id="current_password" name="current_password" type="password" required autocomplete="current-password" />
    <label for="new_password">New password <span class="muted">(at least 8 characters)</span></label>
    <input id="new_password" name="new_password" type="password" required minlength="8" autocomplete="new-password" />
    <label for="confirm_password">New password again</label>
    <input id="confirm_password" name="confirm_password" type="password" required minlength="8" autocomplete="new-password" />
    <button type="submit" class="btn btn-primary" style="margin-top:1.2rem">Change password</button>
  </form>

  <h2>Other settings</h2>
  <p class="muted">Kitchen phone/WhatsApp number, email, and push keys live in
     <code>includes/config.php</code> on the server (cPanel → File Manager). The menu is edited on the
     <a href="menu.php">Menu</a> page.</p>
<?php admin_footer(); ?>
