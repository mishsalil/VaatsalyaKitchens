<?php
/* Builds scripts/dish-photo-map.json — which photo folder belongs to which
 * menu item id. Run this whenever photos are added or the menu changes, then
 * run scripts/build-dish-images.mjs to produce the images.
 *
 * Matching is by NAME, not by guesswork. Most folders match a menu item exactly
 * once punctuation and bracketed portions are ignored. The handful that do not
 * are listed in ALIASES below with the reason, so every non-obvious decision is
 * visible and reviewable rather than buried in a similarity score — putting the
 * wrong photo on a dish is worse than having no photo at all.
 */

chdir(__DIR__ . '/..');
require 'includes/db.php';

const PHOTO_ROOT = 'C:/Users/kulka/Downloads/Completed/STD';

/* Folder name => menu item name, for folders that do not match on their own.
   null means "deliberately no match" — do not substitute something similar. */
const ALIASES = [
    'Aloo Gobhi Dry'        => 'Aloo Gobi Dry',        // spelling: Gobhi / Gobi
    'Aloo Gobhi Masala'     => 'Aloo Gobi Masala',     // same
    'Paneer Chilli Dry'     => 'Chilli Paneer Dry',    // word order
    'Paneer Chilli Gravy'   => 'Chilli Paneer Gravy',  // word order; the retouched
                                                       // files inside are already
                                                       // named "Chilli Paneer Gravy"
    'Spring Rolls'          => 'Veg Spring Roll',      // plural / "Veg" prefix
    // Applies to the standard combo only. "Deluxe Chinese Combo" is a different,
    // larger item and showing it the standard photo would misrepresent it.
    'Chinese Combo'         => 'Chinese Combo Meal',

    // No menu item exists for these. The menu has Veg Manchurian Dry and Paneer
    // Manchurian GRAVY; a dry dish and a gravy look nothing alike, so this is
    // left unmatched rather than forced onto a neighbour.
    'Paneer Manchurian Dry' => null,
    // Not on the menu at all.
    'Methi Malai Matar'     => null,
];

function norm(string $s): string {
    $s = mb_strtolower($s);
    $s = preg_replace('/\[.*?\]|\(.*?\)/', ' ', $s);
    $s = preg_replace('/[^a-z0-9 ]/', ' ', $s);
    return trim(preg_replace('/\s+/', ' ', $s));
}

$items = db()->query('SELECT id, name FROM menu_items')->fetchAll();
$byNorm = [];
foreach ($items as $it) $byNorm[norm($it['name'])][] = $it;

$map = [];
$skipped = [];
$ambiguous = [];

foreach (scandir(PHOTO_ROOT) as $folder) {
    if ($folder === '.' || $folder === '..' || !is_dir(PHOTO_ROOT . "/$folder")) continue;

    if (array_key_exists($folder, ALIASES)) {
        if (ALIASES[$folder] === null) { $skipped[$folder] = 'no matching menu item'; continue; }
        $target = norm(ALIASES[$folder]);
    } else {
        $target = norm($folder);
    }

    if (!isset($byNorm[$target])) { $skipped[$folder] = 'no menu item named "' . $target . '"'; continue; }
    if (count($byNorm[$target]) > 1) {
        // Two items sharing a name would make the destination ambiguous.
        $ambiguous[$folder] = array_column($byNorm[$target], 'id');
        continue;
    }

    $item = $byNorm[$target][0];
    $map[$folder] = ['id' => (int)$item['id'], 'name' => $item['name']];
}

ksort($map);
file_put_contents(
    __DIR__ . '/dish-photo-map.json',
    json_encode($map, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n"
);

printf("mapped %d folders -> menu items\n", count($map));
foreach ($map as $folder => $m) printf("  %-26s -> id %-4d %s\n", $folder, $m['id'], $m['name']);
if ($skipped)   { echo "\nskipped (" . count($skipped) . "):\n";   foreach ($skipped as $f => $why) printf("  %-26s %s\n", $f, $why); }
if ($ambiguous) { echo "\nAMBIGUOUS (" . count($ambiguous) . ") — resolve in ALIASES:\n"; foreach ($ambiguous as $f => $ids) printf("  %-26s ids %s\n", $f, implode(', ', $ids)); }
echo "\nwritten: scripts/dish-photo-map.json\n";
