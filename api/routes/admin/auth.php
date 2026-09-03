<?php
/* POST /api/admin/auth/login  — username + password, rate-limited, starts VKADMIN session.
   POST /api/admin/auth/logout — destroys the admin session.
   The VKADMIN session is already started by api/index.php for /api/admin/*. */
function route($method, $action, $parts): void
{
    // --- login ---
    if ($action === 'login') {
        if ($method !== 'POST') {
            Response::error('Method not allowed', 405);
        }
        require_csrf_api($_POST);

        $username = trim((string)($_POST['username'] ?? ''));
        $password = (string)($_POST['password'] ?? '');
        $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
        $identifier = 'admin:' . $username . ':' . $ip;

        if ($username === '' || $password === '') {
            Response::error('Please enter your username and password.');
        }
        if (too_many_attempts($identifier)) {
            Response::error('Too many attempts. Please try again in 15 minutes.', 429);
        }

        $stmt = db()->prepare('SELECT * FROM admin_users WHERE username = ?');
        $stmt->execute([$username]);
        $admin = $stmt->fetch();

        if (!$admin || !password_verify($password, $admin['password_hash'])) {
            record_attempt($identifier);
            Response::error('Wrong username or password.', 401);
        }

        clear_attempts($identifier);
        session_regenerate_id(true);
        $_SESSION['admin_id'] = (int)$admin['id'];

        Response::json([
            'token' => auth_token_issue('admin', (int)$admin['id'], auth_device_label()),
            'admin' => ['id' => (int)$admin['id'], 'username' => $admin['username'], 'role' => (string)($admin['role'] ?? 'staff')],
            'csrf_token' => csrf_token(),
        ]);
    }

    // --- logout ---
    if ($action === 'logout') {
        if ($method !== 'POST') {
            Response::error('Method not allowed', 405);
        }
        require_csrf_api($_POST);

        // Revoke this device's token as well as the session — see the customer
        // logout. A counter phone signing out must lose access server-side.
        auth_token_revoke(auth_bearer_token());

        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'] ?? '', $p['secure'], $p['httponly']);
        }
        session_destroy();
        Response::json(['ok' => true]);
    }

    Response::error('Method not allowed', 405);
}