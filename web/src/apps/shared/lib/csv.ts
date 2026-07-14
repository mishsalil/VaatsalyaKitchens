/**
 * Hand-rolled CSV helpers — no dependency (the SPA has none beyond react/router).
 * RFC-4180-ish: fields containing commas, quotes or newlines are wrapped in
 * double quotes with embedded quotes doubled.
 */

/** Serialize an array of row objects into a CSV string using the first row's keys as the header. */
export function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvCell(row[h])).join(','));
  }
  return lines.join('\r\n');
}

function escapeCsvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * Parse a CSV string into a 2D array of string cells. A small state machine
 * handles quoted fields, doubled quotes ("") → one quote, and embedded commas /
 * newlines. Caller drops the header row if needed.
 */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  // Normalize CRLF/CR → LF so the newline check only has to handle \n.
  const src = text.replace(/\r\n?/g, '\n');

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < src.length) {
    const c = src[i];

    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      pushField();
      i++;
      continue;
    }
    if (c === '\n') {
      pushRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // Flush the final field/row (a trailing line without a newline).
  if (field !== '' || row.length > 0) {
    pushRow();
  }
  // Drop a trailing empty row produced by a final newline.
  if (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
    rows.pop();
  }
  return rows;
}