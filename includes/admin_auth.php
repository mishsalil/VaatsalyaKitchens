<?php
/* Admin authentication + shared admin page chrome. */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/csrf.php';

function admin_session_start(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => !empty($_SERVER['HTTPS']),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_name('VKADMIN');
    session_start();
}

function current_admin(): ?array
{
    admin_session_start();
    if (empty($_SESSION['admin_id'])) {
        return null;
    }
    $stmt = db()->prepare('SELECT * FROM admin_users WHERE id = ?');
    $stmt->execute([(int)$_SESSION['admin_id']]);
    return $stmt->fetch() ?: null;
}

/** Call at the top of every admin page except login.php. */
function require_admin(): array
{
    header('X-Robots-Tag: noindex, nofollow');
    $admin = current_admin();
    if (!$admin) {
        header('Location: login.php');
        exit;
    }
    return $admin;
}

function admin_header(string $title, string $active = ''): void
{
    $items = [
        'index.php'     => '📊 Dashboard',
        'orders.php'    => '🧾 Orders',
        'menu.php'      => '🍛 Menu',
        'customers.php' => '👥 Customers',
        'broadcast.php' => '🔔 Broadcast',
        'settings.php'  => '⚙️ Settings',
    ];
    ?><!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title><?= e($title) ?> — Admin · Vaatsalya Kitchens</title>
  <link rel="icon" href="../assets/logo.svg" type="image/svg+xml" />
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../css/style.css" />
  <link rel="stylesheet" href="../css/admin.css" />
</head>
<body class="admin-body">
  <header class="site-header">
    <div class="container">
      <a class="brand" href="index.php">
        <img class="brand-mark" src="../assets/logo.svg" alt="" />
        <span class="brand-name">Admin Panel</span>
      </a>
      <nav class="main-nav" aria-label="Admin navigation">
        <?php foreach ($items as $href => $label): ?>
          <a href="<?= $href ?>" <?= $href === $active ? 'class="active"' : '' ?>><?= $label ?></a>
        <?php endforeach; ?>
        <a href="login.php?action=logout">Sign Out</a>
      </nav>
    </div>
  </header>
  <main class="container admin-main">
<?php
}

function admin_footer(): void
{
    ?>
  </main>
</body>
</html>
<?php
}
