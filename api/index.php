<?php
/* Customer REST API front controller.
   Reuses the existing includes/ core (auth, tokens, db, helpers) and dispatches
   to api/routes/{resource}.php, each defining route($method, $action, $parts).
   Mirrors the edible-oil-ERP api/index.php pattern. */

require __DIR__ . '/../includes/db.php';
require __DIR__ . '/../includes/helpers.php';
require __DIR__ . '/../includes/auth.php';
require __DIR__ . '/../includes/admin_auth.php';
require __DIR__ . '/lib/Response.php';

// Merge a JSON request body into $_POST so route handlers can read $_POST for
// every method (the SPA always sends JSON, not form-encoded).
$input = json_decode(file_get_contents('php://input'), true) ?? [];
$_REQUEST = array_merge($_REQUEST, $input);
if (!empty($input)) {
    $_POST = array_merge($_POST, $input);
}

// --- CORS (a no-op under same-origin; needed if the SPA is ever served from
//     a different host). Credentialed requests require a reflected, non-* origin. ---
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    header("Access-Control-Allow-Origin: $origin");
    header('Vary: Origin');
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// --- Path parsing: strip the API base (derived from where index.php is
//     served) so the app works under a subdirectory or at the domain root. ---
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$script = $_SERVER['SCRIPT_NAME'] ?? '/';
$apiBase = dirname($script);
if ($apiBase === '/' || $apiBase === '\\') {
    $apiBase = '/api';
}
$apiBase = rtrim(str_replace('\\', '/', $apiBase), '/');
if (stripos($path, $apiBase) === 0) {
    $path = substr($path, strlen($apiBase));
}
$path = trim($path, '/');
$parts = explode('/', $path);
$resource = $parts[0] ?? '';
$action = $parts[1] ?? 'index';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// --- Admin sub-API: /api/admin/{subresource}/{subaction}[/{id}]
//     Uses the separate VKADMIN session; sub-resource file at routes/admin/{sub}.php,
//     sub-action in $parts[2], id in $parts[3]. Mirrors the customer dispatch. ---
if ($resource === 'admin') {
    require_once __DIR__ . '/../includes/admin_roles.php';
    $sub = $parts[1] ?? '';
    if ($sub === '' || !preg_match('/^[a-z0-9_]+$/', $sub)) {
        Response::error('Route not found', 404);
    }
    $adminRouteFile = __DIR__ . '/routes/admin/' . $sub . '.php';
    if (!file_exists($adminRouteFile)) {
        Response::error('Route not found', 404);
    }
    require $adminRouteFile;
    if (!function_exists('route')) {
        Response::error('Route handler not found', 500);
    }
    route($method, $parts[2] ?? 'index', $parts);
    return;
}

if ($resource === '') {
    Response::json(['message' => 'Vaatsalya Kitchens API', 'version' => '1.0']);
}

// Guard against path traversal: resource must be a simple identifier.
if (!preg_match('/^[a-z0-9_]+$/', $resource)) {
    Response::error('Route not found', 404);
}

$routeFile = __DIR__ . '/routes/' . $resource . '.php';
if (!file_exists($routeFile)) {
    Response::error('Route not found', 404);
}
require $routeFile;
if (!function_exists('route')) {
    Response::error('Route handler not found', 500);
}
route($method, $action, $parts);