<?php
/* Proves database/migrate_production.sql still matches the numbered migrations.
   Builds two scratch databases and compares columns AND indexes.
   Scratch DBs are dropped at the end. */

chdir(__DIR__ . '/..');
require 'includes/db.php';

$pdo = db();

function stmts(string $file): array
{
    $sql = file_get_contents($file);
    if ($sql === false) throw new RuntimeException("cannot read $file");
    // Strip -- line comments (none of these files use string literals containing --)
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    $out = [];
    foreach (explode(';', $sql) as $s) {
        $s = trim($s);
        if ($s !== '') $out[] = $s;
    }
    return $out;
}

function run(PDO $pdo, string $db, array $files, string $label): void
{
    $pdo->exec("DROP DATABASE IF EXISTS `$db`");
    $pdo->exec("CREATE DATABASE `$db` DEFAULT CHARSET=utf8mb4");
    $pdo->exec("USE `$db`");
    foreach ($files as $f) {
        foreach (stmts($f) as $s) {
            try {
                // The cumulative file ends with a verification SELECT; its rows
                // must be consumed or the connection stays busy.
                if (preg_match('/^\s*(SELECT|SHOW)\b/i', $s)) {
                    $st = $pdo->query($s);
                    $st->fetchAll();
                    $st->closeCursor();
                } else {
                    $pdo->exec($s);
                }
            } catch (PDOException $e) {
                echo "  FAIL in $f\n    " . substr(preg_replace('/\s+/', ' ', $s), 0, 120) . "\n    " . $e->getMessage() . "\n";
                throw $e;
            }
        }
    }
    echo "  built $label\n";
}

function shape(PDO $pdo, string $db): array
{
    $out = [];
    $q = $pdo->prepare(
        'SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
           FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?
          ORDER BY TABLE_NAME, COLUMN_NAME'
    );
    $q->execute([$db]);
    foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $out['col ' . $r['TABLE_NAME'] . '.' . $r['COLUMN_NAME']] =
            $r['COLUMN_TYPE'] . '|' . $r['IS_NULLABLE'] . '|' . ($r['COLUMN_DEFAULT'] ?? 'NULL') . '|' . $r['EXTRA'];
    }
    $q = $pdo->prepare(
        'SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
           FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ?
          ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX'
    );
    $q->execute([$db]);
    foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $key = 'idx ' . $r['TABLE_NAME'] . '.' . $r['INDEX_NAME'];
        $out[$key] = ($out[$key] ?? '') . $r['SEQ_IN_INDEX'] . ':' . $r['COLUMN_NAME'] . '(u' . (1 - $r['NON_UNIQUE']) . ') ';
    }
    return $out;
}

$numbered = array_merge(['schema.sql'], glob('database/migration_0*.sql'));
sort($numbered);
$numbered = array_merge(['schema.sql'], array_values(array_filter($numbered, fn($f) => $f !== 'schema.sql')));

echo "Numbered chain: " . count($numbered) . " files\n";
// Label from what was actually globbed, so it cannot go stale the way a
// hardcoded range does — the same trap the version-pinned filename had.
$lastMigration = basename(end($numbered));
run($pdo, 'vk_drift_numbered', $numbered, 'vk_drift_numbered (schema + every migration through ' . $lastMigration . ')');

// Cumulative, run TWICE to prove re-runnability.
run($pdo, 'vk_drift_cumulative', ['schema.sql', 'database/migrate_production.sql', 'database/migrate_production.sql'], 'vk_drift_cumulative (schema + cumulative x2)');

$a = shape($pdo, 'vk_drift_numbered');
$b = shape($pdo, 'vk_drift_cumulative');

$diff = [];
foreach ($a as $k => $v) {
    if (!array_key_exists($k, $b)) $diff[] = "only in numbered:   $k";
    elseif ($b[$k] !== $v)          $diff[] = "differs:            $k\n    numbered:   $v\n    cumulative: {$b[$k]}";
}
foreach ($b as $k => $v) {
    if (!array_key_exists($k, $a)) $diff[] = "only in cumulative: $k";
}

echo "\nCompared " . count($a) . " objects (columns + indexes)\n";
if ($diff) {
    echo "DRIFT DETECTED (" . count($diff) . "):\n";
    foreach ($diff as $d) echo "  $d\n";
} else {
    echo "IDENTICAL - no drift\n";
}

$pdo->exec('DROP DATABASE IF EXISTS `vk_drift_numbered`');
$pdo->exec('DROP DATABASE IF EXISTS `vk_drift_cumulative`');
echo "scratch databases dropped\n";
exit($diff ? 1 : 0);
