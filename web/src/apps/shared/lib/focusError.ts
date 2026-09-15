/** Scrolls the first existing element into view (centred) and focuses it. Returns true when one was found. */
export function focusFirstError(ids: string[]): boolean {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    const native = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el instanceof HTMLButtonElement;
    if (!native && el.tabIndex < 0) el.tabIndex = -1;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus({ preventScroll: true });
    return true;
  }
  return false;
}

export type CheckoutFieldKey = 'name' | 'phone' | 'when' | 'address' | 'order' | 'code' | 'form';

/** Which field a server refusal belongs to — the sentences are the server's own fixed strings. */
export function checkoutFieldFor(message: string, appliedCode?: string | null): CheckoutFieldKey {
  const m = message.toLowerCase();
  if (appliedCode && message.includes(appliedCode)) return 'code';   // before 'phone': "Enter your phone number to use WELCOME."
  if (m.includes('your name')) return 'name';
  if (m.includes('phone number')) return 'phone';
  if (m.includes('when you need the food') || m.startsWith('we are closed')) return 'when';
  if (m.includes('address')) return 'address';
  if (m.includes('at least one dish') || m.startsWith('please choose')) return 'order';
  if (/\bcode\b/.test(m)) return 'code';
  return 'form';
}
