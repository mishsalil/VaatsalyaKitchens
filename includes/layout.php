<?php
/* Shared page chrome for all customer-facing pages. */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/csrf.php';

/**
 * $opts: title (string), description (string), nav (array of [href, label] extra links)
 */
function page_header(array $opts = []): void
{
    $customer = current_customer();
    $title = $opts['title'] ?? 'Vaatsalya Kitchens';
    $description = $opts['description'] ?? 'Vaatsalya Kitchens — home-style food for small parties, kitty parties and bulk orders.';
    ?><!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title><?= e($title) ?></title>
  <meta name="description" content="<?= e($description) ?>" />
  <meta name="csrf-token" content="<?= csrf_token() ?>" />
  <meta name="vapid-key" content="<?= e(config()['vapid']['public_key']) ?>" />
  <meta name="theme-color" content="#4f0f0f" />
  <link rel="icon" href="assets/logo.svg" type="image/svg+xml" />
  <link rel="manifest" href="manifest.webmanifest" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Poppins:wght@400;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="css/style.css" />
</head>
<body>

  <header class="site-header">
    <div class="container">
      <a class="brand" href="index.php">
        <img class="brand-mark" src="assets/logo.svg" alt="" />
        <span class="brand-name">Vaatsalya Kitchens</span>
      </a>
      <nav class="main-nav" aria-label="Main navigation">
        <?php foreach (($opts['nav'] ?? []) as [$href, $label]): ?>
          <a href="<?= e($href) ?>"><?= e($label) ?></a>
        <?php endforeach; ?>
        <?php if ($customer): ?>
          <a href="my-account.php">👤 <?= e(explode(' ', trim($customer['name']))[0]) ?></a>
        <?php else: ?>
          <a href="login.php">Sign In</a>
        <?php endif; ?>
        <a class="btn btn-primary" href="order.php">Order Now</a>
      </nav>
    </div>
  </header>
<?php
}

/** @param string[] $scripts extra JS files to load before </body> */
function page_footer(array $scripts = []): void
{
    ?>
  <footer class="site-footer">
    <div class="container">
      <p><strong>Vaatsalya Kitchens</strong> · <span lang="hi">वात्सल्य</span> — food with motherly love</p>
      <p class="gstin">GSTIN: 09AVYPM7231Q1ZE</p>
    </div>
  </footer>
  <?php foreach ($scripts as $src): ?>
  <script src="<?= e($src) ?>"></script>
  <?php endforeach; ?>
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(function () {});
    }
  </script>
</body>
</html>
<?php
}
