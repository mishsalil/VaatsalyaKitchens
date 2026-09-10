<?php
/* Guard against the "wrong clock" class of bug in the reviews feature.

   PHP and MySQL can disagree about the current time (on this host, PHP is
   Europe/Berlin and MySQL runs on the system/IST clock, 3.5 hours apart, and
   the repo sets no default timezone). Every timestamp this feature reads —
   delivered_at, needed_at, created_at, review_tokens.expires_at — was written
   by MySQL. If any code path takes "now" from PHP instead of the database,
   every comparison against those timestamps shifts by the clock offset,
   silently, and every behavioural test still passes (they don't exercise two
   independently-clocked engines). This script scans the feature's source
   files and fails the build if PHP's clock is used anywhere.

   It takes no database on purpose — it is a static source check, not a
   behavioural one, so it can run anywhere without vaatsalya_kitchens. */

$files = [
    'includes/reviews.php',
    'includes/review_tokens.php',
    'api/routes/reviews.php',
    'api/routes/account.php',
    'api/routes/admin/reviews.php',
    'scripts/send-review-prompts.php',
];

/* Constructing a moment from PHP's clock, or a relative offset from it.
   Parsing a timestamp that came from the database — new DateTimeImmutable($x)
   where $x is a variable, not a literal — is exactly what we want, and these
   patterns deliberately do not match that. */
$patterns = [
    '/\bnew\s+DateTime\s*\(\s*\)/'                => "new DateTime()",
    '/\bnew\s+DateTimeImmutable\s*\(\s*\)/'       => "new DateTimeImmutable()",
    '/\bnew\s+DateTime\s*\(\s*[\'"]\+/'           => "new DateTime('+...')",
    '/\bnew\s+DateTimeImmutable\s*\(\s*[\'"]\+/'  => "new DateTimeImmutable('+...')",
    '/\btime\s*\(\s*\)/'                          => "time()",
    '/\bdate\s*\(/'                               => "date(",
];

$root = dirname(__DIR__);
$violations = [];

foreach ($files as $rel) {
    $path = $root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $rel);
    if (!is_file($path)) {
        $violations[] = [
            'file' => $rel,
            'line' => 0,
            'what' => 'missing file',
            'text' => '(scanned file does not exist - update the $files list in this script)',
        ];
        continue;
    }
    $lines = file($path);
    foreach ($lines as $i => $line) {
        foreach ($patterns as $regex => $label) {
            if (preg_match($regex, $line)) {
                $violations[] = [
                    'file' => $rel,
                    'line' => $i + 1,
                    'what' => $label,
                    'text' => trim($line),
                ];
            }
        }
    }
}

if ($violations) {
    fwrite(STDERR, "FAIL: PHP's clock is used where the database's clock must be:\n\n");
    foreach ($violations as $v) {
        fwrite(STDERR, sprintf(
            "  %s:%d — %s\n      %s\n",
            $v['file'],
            $v['line'],
            $v['what'],
            $v['text']
        ));
    }
    fwrite(STDERR, "\n" . count($violations) . " violation(s) found.\n");
    exit(1);
}

echo "PASS: no PHP-clock usage found in " . count($files) . " scanned files.\n";
exit(0);
