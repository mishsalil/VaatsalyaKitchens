<?php
/* Admin push broadcast.

   GET  /api/admin/broadcast              → {subscribers}
   POST /api/admin/broadcast/send         {title, body, url?} → {sent, failed}

   Refuses with a clear error when Web Push isn't configured (VAPID keys in
   config.php), so the admin doesn't think a silent no-op was a real send. */
require_once __DIR__ . '/../../../includes/push.php';

function route($method, $action, $parts): void
{
    require_admin_cap('broadcast');

    if ($action === 'index' && $method === 'GET') {
        $count = (int)db()->query('SELECT COUNT(*) FROM push_subscriptions')->fetchColumn();
        Response::json(['subscribers' => $count, 'push_configured' => push_configured()]);
    }

    if ($action === 'send' && $method === 'POST') {
        require_csrf_api($_POST);
        if (!push_configured()) {
            Response::error('Web Push is not configured. Add VAPID keys to includes/config.php first.', 400);
        }
        $title = mb_substr(trim((string)($_POST['title'] ?? '')), 0, 120);
        $body  = mb_substr(trim((string)($_POST['body'] ?? '')), 0, 500);
        $url   = mb_substr(trim((string)($_POST['url'] ?? '')), 0, 300);
        if ($title === '' || $body === '') {
            Response::error('Please enter both a title and a message.');
        }
        [$sent, $failed] = push_send_broadcast($title, $body, $url);
        Response::json(['ok' => true, 'sent' => (int)$sent, 'failed' => (int)$failed]);
    }

    Response::error('Method not allowed', 405);
}