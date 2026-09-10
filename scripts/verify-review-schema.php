<?php
/* Proves migration_013 produces the same shape whether a database is built
   fresh (install_fresh.sql) or migrated from an older one
   (migrate_production.sql), and that re-running the cumulative migration is a
   no-op. The two paths drifting apart is the failure this catches. */

chdir(__DIR__ . '/..');
require 'includes/db.php';
$pdo = db();

function stmts(string $file): array {
    $sql = preg_replace('/^\s*--.*$/m', '', file_get_contents($file));
    return array_values(array_filter(array_map('trim', explode(';', $sql)), fn($s) => $s !== ''));
}

function run(PDO $pdo, array $files): void {
    foreach ($files as $f) {
        foreach (stmts($f) as $s) {
            if (preg_match('/^\s*(SELECT|SHOW)\b/i', $s)) {
                $st = $pdo->query($s); $st->fetchAll(); $st->closeCursor();
            } else {
                $pdo->exec($s);
            }
        }
    }
}

function columns(PDO $pdo, string $db, string $table): array {
    $st = $pdo->prepare(
        'SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY COLUMN_NAME'
    );
    $st->execute([$db, $table]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

$pass = 0; $fail = 0;
function check(string $what, bool $ok): void {
    global $pass, $fail;
    if ($ok) { $pass++; echo "  ok   $what\n"; }
    else     { $fail++; echo "  FAIL $what\n"; }
}

$fresh = 'vk_rev_schema_fresh';
$pdo->exec("DROP DATABASE IF EXISTS `$fresh`");
$pdo->exec("CREATE DATABASE `$fresh` DEFAULT CHARSET=utf8mb4");
$pdo->exec("USE `$fresh`");
run($pdo, ['database/install_fresh.sql']);
echo "built fresh from install_fresh.sql\n";

$tables = ['order_reviews', 'order_item_reviews', 'review_prompts', 'review_tokens'];
foreach ($tables as $t) {
    check("fresh has table $t", columns($pdo, $fresh, $t) !== []);
}
check('fresh orders has delivered_at', array_filter(
    columns($pdo, $fresh, 'orders'), fn($c) => $c['COLUMN_NAME'] === 'delivered_at'
) !== []);
check('fresh has reviews_since setting', (int)$pdo->query(
    "SELECT COUNT(*) FROM settings WHERE `key` = 'reviews_since'"
)->fetchColumn() === 1);

/* The migrated path: an old database is install_fresh MINUS this migration,
   which we approximate by building fresh then dropping what 013 added. */
$migrated = 'vk_rev_schema_migrated';
$pdo->exec("DROP DATABASE IF EXISTS `$migrated`");
$pdo->exec("CREATE DATABASE `$migrated` DEFAULT CHARSET=utf8mb4");
$pdo->exec("USE `$migrated`");
run($pdo, ['database/install_fresh.sql']);
foreach (array_reverse($tables) as $t) { $pdo->exec("DROP TABLE IF EXISTS `$t`"); }
$pdo->exec('ALTER TABLE orders DROP COLUMN delivered_at');
$pdo->exec("DELETE FROM settings WHERE `key` = 'reviews_since'");
echo "built a pre-013 database\n";

run($pdo, ['database/migrate_production.sql']);
echo "applied migrate_production.sql\n";
foreach ($tables as $t) {
    check("migrated has table $t", columns($pdo, $migrated, $t) !== []);
    check("$t identical on both paths", columns($pdo, $fresh, $t) == columns($pdo, $migrated, $t));
}
check('migrated orders has delivered_at', array_filter(
    columns($pdo, $migrated, 'orders'), fn($c) => $c['COLUMN_NAME'] === 'delivered_at'
) !== []);

run($pdo, ['database/migrate_production.sql']);
echo "applied migrate_production.sql a second time\n";
foreach ($tables as $t) {
    check("$t unchanged after re-run", columns($pdo, $fresh, $t) == columns($pdo, $migrated, $t));
}

$pdo->exec("DROP DATABASE IF EXISTS `$fresh`");
$pdo->exec("DROP DATABASE IF EXISTS `$migrated`");

echo "\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);
