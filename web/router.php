<?php
/* Local prod-like router for the BUILT storefront.
   Run:  php -S localhost:8082 -t web/dist web/router.php
   - /api/*            → the PHP front controller (../api/index.php), same origin
   - real files in dist (assets, sw.js, manifest, favicon) → served as-is
   - everything else   → web/dist/index.html (SPA client-side routing fallback)

   `php -S` ignores .htaccess, hence this router. The old PHP pages + admin are
   not served here by design — this is the post-cutover, SPA-default view. The
   old site keeps running separately on :8080 for parity during migration. */

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$uri = str_replace('\\', '/', $uri);

if ($uri === '/api' || str_starts_with($uri, '/api/')) {
    $_SERVER['SCRIPT_NAME'] = '/api/index.php';
    require __DIR__ . '/../api/index.php';
    return true;
}

$dist = __DIR__ . '/dist';

// Serve runtime-uploaded branding (logo) from web/public/branding, which is
// outside the dist docroot (so uploads survive `npm run build`). On a real
// Apache deploy Vite copies web/public/* into the docroot, so /branding/* is
// served directly there — this rule only matters for the local php -S server.
// We must serve the bytes ourselves (not `return false`) because php -S's
// docroot is web/dist, so leaving it to the server would 404.
if (str_starts_with($uri, '/branding/')) {
    $public = __DIR__ . '/public';
    $file = $public . $uri;
    $real = realpath($file);
    if ($real !== false && str_starts_with(str_replace('\\', '/', $real), str_replace('\\', '/', $public)) && is_file($real)) {
        $ext = strtolower(pathinfo($real, PATHINFO_EXTENSION));
        $mime = match ($ext) {
            'jpg' => 'image/jpeg',
            'png' => 'image/png',
            'webp' => 'image/webp',
            'svg' => 'image/svg+xml',
            default => 'application/octet-stream',
        };
        header("Content-Type: $mime");
        header('Cache-Control: public, max-age=3600');
        readfile($real);
        return true;
    }
}

// Serve a real built asset if it exists (Vite hashed bundles, sw.js, etc.).
if ($uri !== '/' && $uri !== '' ) {
    $file = $dist . $uri;
    // Guard against traversal outside dist.
    $real = realpath($file);
    if ($real !== false && str_starts_with(str_replace('\\', '/', $real), str_replace('\\', '/', $dist)) && is_file($real)) {
        return false; // let php -S serve it with the right MIME type
    }
}

// SPA fallback: any non-file path → index.html (React Router handles the rest).
$index = $dist . '/index.html';
if (is_file($index)) {
    header('Content-Type: text/html; charset=utf-8');
    readfile($index);
    return true;
}

http_response_code(404);
echo 'Not found';
return true;