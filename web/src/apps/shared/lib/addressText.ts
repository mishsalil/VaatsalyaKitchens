/**
 * "House, Landmark, Area" — the one address_text column, composed from the
 * three fields the picker shows. Nothing structural is stored; the schema is
 * unchanged. Blank parts are skipped so the line never reads "Flat 3, , ".
 */
export function composeAddressText(parts: { house: string; landmark: string; area: string }): string {
  return [parts.house, parts.landmark, parts.area]
    .map((p) => p.trim().replace(/,+$/, '').trim())
    .filter((p) => p !== '')
    .join(', ');
}
