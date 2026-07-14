<?php
/* Dev router for `php -S localhost:8081 router.php` (the PHP built-in server
   ignores .htaccess). Routes /api/* to the REST front controller
   (api/index.php). Everything else is served from the docroot by php -S
   itself (admin/, assets/, etc.). The customer storefront is the built SPA
   served via web/router.php on :8082 (or Vite dev on :5173). */

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);

if ($uri === '/api' || str_starts_with($uri, '/api/')) {
    $_SERVER['SCRIPT_NAME'] = '/api/index.php';
    require __DIR__ . '/api/index.php';
    return true;
}

return false; // php -S serves the file from the docroot