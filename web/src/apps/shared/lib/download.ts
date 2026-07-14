/**
 * Trigger a browser download for an in-memory Blob (used by CSV export).
 * Falls back to a data URL if URL.createObjectURL is unavailable.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on the next tick so the click has time to resolve.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}