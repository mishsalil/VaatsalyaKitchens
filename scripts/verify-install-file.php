<?php
/* Proves database/install_fresh.sql builds the same schema as the numbered
   chain, and that its guard refuses a non-empty database. */

chdir(__DIR__ . '/..');
require 'includes/db.php';
$pdo = db();

function stmts(string $file): array {
    $sql = preg_replace('/^\s*--.*$/m', '', file_get_contents($file));
    return array_values(array_filter(array_map('trim', explode(';', $sql)), fn($s) => $s !== ''));
}

function run(PDO $pdo, string $db, array $files): void {
    $pdo->exec("DROP DATABASE IF EXISTS `$db`");
    $pdo->exec("CREATE DATABASE `$db` DEFAULT CHARSET=utf8mb4");
    $pdo->exec("USE `$db`");
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

function shape(PDO $pdo, string $db): array {
    $out = [];
    $q = $pdo->prepare('SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
                          FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, COLUMN_NAME');
    $q->execute([$db]);
    foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $out['col ' . $r['TABLE_NAME'] . '.' . $r['COLUMN_NAME']] =
            $r['COLUMN_TYPE'] . '|' . $r['IS_NULLABLE'] . '|' . ($r['COLUMN_DEFAULT'] ?? 'NULL') . '|' . $r['EXTRA'];
    }
    $q = $pdo->prepare('SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
                          FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ?
                         ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX');
    $q->execute([$db]);
    foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $k = 'idx ' . $r['TABLE_NAME'] . '.' . $r['INDEX_NAME'];
        $out[$k] = ($out[$k] ?? '') . $r['SEQ_IN_INDEX'] . ':' . $r['COLUMN_NAME'] . '(u' . (1 - $r['NON_UNIQUE']) . ') ';
    }
    return $out;
}

$numbered = array_merge(['schema.sql'], glob('database/migration_0*.sql'));
run($pdo, 'vk_inst_numbered', $numbered);
echo "built from schema.sql + " . (count($numbered) - 1) . " numbered migrations\n";

run($pdo, 'vk_inst_single', ['database/install_fresh.sql']);
echo "built from install_fresh.sql alone\n";

$a = shape($pdo, 'vk_inst_numbered');
$b = shape($pdo, 'vk_inst_single');
$diff = [];
foreach ($a as $k => $v) {
    if (!array_key_exists($k, $b)) $diff[] = "only in numbered:   $k";
    elseif ($b[$k] !== $v)         $diff[] = "differs: $k\n    numbered: $v\n    single:   {$b[$k]}";
}
foreach ($b as $k => $v) if (!array_key_exists($k, $a)) $diff[] = "only in single file: $k";

echo "\ncompared " . count($a) . " objects (columns + indexes)\n";
echo $diff ? "DIFFERENCES (" . count($diff) . "):\n  " . implode("\n  ", $diff) . "\n" : "IDENTICAL\n";

// Seed data should also match.
$pdo->exec('USE `vk_inst_single`');
foreach (['admin_users', 'menu_categories', 'menu_items', 'kitchen_hours', 'settings'] as $t) {
    printf("  seeded %-18s %s\n", $t, $pdo->query("SELECT COUNT(*) FROM `$t`")->fetchColumn());
}

// The guard must refuse a second run.
echo "\nguard: running it again on the now-populated database...\n";
try {
    $pdo->exec('USE `vk_inst_single`');
    foreach (stmts('database/install_fresh.sql') as $s) {
        if (preg_match('/^\s*(SELECT|SHOW)\b/i', $s)) { $st = $pdo->query($s); $st->fetchAll(); $st->closeCursor(); }
        else { $pdo->exec($s); }
    }
    echo "  FAIL — it ran instead of refusing\n";
    $guardOk = false;
} catch (PDOException $e) {
    $guardOk = stripos($e->getMessage(), 'refusing_to_run__database_is_not_empty') !== false;
    echo ($guardOk ? "  PASS — refused: " : "  FAIL — wrong error: ") . substr($e->getMessage(), 0, 120) . "\n";
}

$pdo->exec('DROP DATABASE IF EXISTS `vk_inst_numbered`');
$pdo->exec('DROP DATABASE IF EXISTS `vk_inst_single`');
echo "\nscratch databases dropped\n";
exit(($diff || !$guardOk) ? 1 : 0);
