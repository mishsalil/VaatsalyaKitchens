<?php
require_once __DIR__ . '/../includes/admin_auth.php';

if (($_GET['action'] ?? '') === 'logout') {
    admin_session_start();
    $_SESSION = [];
    session_destroy();
    header('Location: login.php');
    exit;
}

if (current_admin()) {
    header('Location: index.php');
    exit;
}

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf_form();
    $username = trim((string)($_POST['username'] ?? ''));
    $password = (string)($_POST['password'] ?? '');
    $rateKey = 'admin:' . $username . ':' . ($_SERVER['REMOTE_ADDR'] ?? '');

    if (too_many_attempts($rateKey)) {
        $error = 'Too many tries. Please wait 15 minutes.';
    } else {
        $stmt = db()->prepare('SELECT * FROM admin_users WHERE username = ?');
        $stmt->execute([$username]);
        $admin = $stmt->fetch();
        if ($admin && password_verify($password, $admin['password_hash'])) {
            clear_attempts($rateKey);
            session_regenerate_id(true);
            $_SESSION['admin_id'] = (int)$admin['id'];
            header('Location: index.php');
            exit;
        }
        record_attempt($rateKey);
        $error = 'Wrong username or password.';
    }
}

header('X-Robots-Tag: noindex, nofollow');
?><!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Admin Sign In — Vaatsalya Kitchens</title>
  <link rel="icon" href="../assets/icon-192.png" type="image/png" />
  <link rel="stylesheet" href="../css/style.css" />
  <link rel="stylesheet" href="../css/admin.css" />
</head>
<body class="admin-body">
  <main class="container admin-main" style="max-width:440px">
    <h1 style="text-align:center;margin-top:2rem">🔐 Admin Sign In</h1>
    <?php if ($error): ?><p class="flash-err"><?= e($error) ?></p><?php endif; ?>
    <form method="post" class="admin-form nice-box">
      <?= csrf_field() ?>
      <label for="username">Username</label>
      <input id="username" name="username" type="text" required autocomplete="username" />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" required autocomplete="current-password" />
      <button type="submit" class="btn btn-maroon btn-big" style="margin-top:1.2rem">Sign In</button>
    </form>
  </main>
</body>
</html>
