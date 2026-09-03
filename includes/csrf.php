<?php
/* CSRF protection for forms and JSON APIs. Requires an active session. */

require_once __DIR__ . '/tokens.php';

function csrf_token(): string
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function csrf_field(): string
{
    return '<input type="hidden" name="csrf" value="' . csrf_token() . '">';
}

function verify_csrf(?string $token): bool
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    return is_string($token)
        && !empty($_SESSION['csrf_token'])
        && hash_equals($_SESSION['csrf_token'], $token);
}

/** For JSON APIs: verify token from X-CSRF-Token header or "csrf" body field; 403 on failure.
 *
 *  Bearer-authenticated requests are exempt, and safely so. CSRF exists because
 *  a browser attaches cookies to cross-site requests on its own, letting another
 *  origin spend the victim's ambient credential. Nothing attaches an
 *  Authorization header automatically — a hostile page would have to read the
 *  token first, and if it can do that the site is already lost to XSS and a CSRF
 *  token would not save it. Without this exemption every mutation from the
 *  native app would 403, since it has no session to hold a CSRF token in.
 *
 *  This whole layer goes away in phase 4, once the web app carries tokens too. */
function require_csrf_api(array $body): void
{
    if (auth_bearer_token() !== null) {
        return;
    }
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($body['csrf'] ?? null);
    if (!verify_csrf($token)) {
        json_error('Session expired — please refresh the page and try again.', 403);
    }
}

/** For classic form POSTs: die with 403 on failure. */
function require_csrf_form(): void
{
    if (!verify_csrf($_POST['csrf'] ?? null)) {
        http_response_code(403);
        exit('Session expired — please go back, refresh the page, and try again.');
    }
}
