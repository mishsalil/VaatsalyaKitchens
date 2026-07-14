<?php
/* Admin team / role management (Super only — cap `roles`).

   GET  /api/admin/team                       → {users:[{id,username,role,created_at}]}
   POST /api/admin/team/add                   {username,password,role} → {id}
   POST /api/admin/team/update_role/{id}      {role}
   POST /api/admin/team/reset_password/{id}   {new}
   POST /api/admin/team/delete/{id}

   Never exposes password_hash. Guards:
     - role validated against admin_roles(); username unique (DB enforces too).
     - cannot delete yourself.
     - cannot demote/delete the LAST super (always keep ≥1 super).

   Passwords are hashed with password_hash(PASSWORD_DEFAULT). This is the only
   route with the `roles` cap, so only Super can create/demote other admins. */
function route($method, $action, $parts): void
{
    $me = require_admin_cap('roles');
    $db = db();

    // --- list (never password_hash) ---
    if ($action === 'index' && $method === 'GET') {
        $users = $db->query(
            'SELECT id, username, role, created_at FROM admin_users ORDER BY id ASC'
        )->fetchAll();
        foreach ($users as &$u) {
            $u['id'] = (int)$u['id'];
        }
        unset($u);
        Response::json(['users' => $users, 'roles' => admin_roles()]);
    }

    if ($method !== 'POST') {
        Response::error('Method not allowed', 405);
    }
    require_csrf_api($_POST);

    if ($action === 'add') {
        $username = mb_substr(trim((string)($_POST['username'] ?? '')), 0, 60);
        $password = (string)($_POST['password'] ?? '');
        $role     = (string)($_POST['role'] ?? '');
        if ($username === '' || $password === '') {
            Response::error('Please enter a username and a password.');
        }
        if (strlen($password) < 8) {
            Response::error('Password must be at least 8 characters.');
        }
        if (!admin_role_valid($role)) {
            Response::error('Please choose a valid role.');
        }
        $dup = $db->prepare('SELECT 1 FROM admin_users WHERE username = ?');
        $dup->execute([$username]);
        if ($dup->fetch()) {
            Response::error('That username is already taken.');
        }
        $stmt = $db->prepare(
            'INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, ?)'
        );
        $stmt->execute([$username, password_hash($password, PASSWORD_DEFAULT), $role]);
        Response::json(['id' => (int)$db->lastInsertId()]);
    }

    // update_role / reset_password / delete all target one user by id.
    $targetId = (int)($parts[3] ?? 0);
    $stmt = $db->prepare('SELECT id, username, role FROM admin_users WHERE id = ?');
    $stmt->execute([$targetId]);
    $target = $stmt->fetch();
    if (!$target) {
        Response::error('User not found.', 404);
    }

    if ($action === 'update_role') {
        $role = (string)($_POST['role'] ?? '');
        if (!admin_role_valid($role)) {
            Response::error('Please choose a valid role.');
        }
        // Demoting the last super to something else would leave no super.
        if ((string)$target['role'] === 'super' && $role !== 'super' && count_supers() <= 1) {
            Response::error('You cannot demote the last Super user.');
        }
        $db->prepare('UPDATE admin_users SET role = ? WHERE id = ?')->execute([$role, $targetId]);
        Response::success('Role updated');
    }

    if ($action === 'reset_password') {
        $new = (string)($_POST['new'] ?? '');
        if (strlen($new) < 8) {
            Response::error('Password must be at least 8 characters.');
        }
        $db->prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?')
            ->execute([password_hash($new, PASSWORD_DEFAULT), $targetId]);
        Response::success('Password reset');
    }

    if ($action === 'delete') {
        if ($targetId === (int)$me['id']) {
            Response::error('You cannot delete your own account.');
        }
        if ((string)$target['role'] === 'super' && count_supers() <= 1) {
            Response::error('You cannot delete the last Super user.');
        }
        $db->prepare('DELETE FROM admin_users WHERE id = ?')->execute([$targetId]);
        Response::success('Deleted');
    }

    Response::error('Method not allowed', 405);
}

/** Number of super users — used to protect the last super from demotion/deletion. */
function count_supers(): int
{
    return (int)db()->query("SELECT COUNT(*) FROM admin_users WHERE role = 'super'")->fetchColumn();
}