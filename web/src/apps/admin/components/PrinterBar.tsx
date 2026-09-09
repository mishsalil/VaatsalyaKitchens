import { useEffect, useState } from 'react';
import { Printer, RefreshCw, Check } from 'lucide-react';
import {
  printerSupported,
  listPairedPrinters,
  ensurePrinterPermission,
  printBlocks,
  PRINTER_SETTLE_MS,
  type PairedPrinter,
} from '../../shared/print/thermalPrinter';
import { receiptText, type PaperWidth, type ReceiptBusiness, type ReceiptOrder } from '../../shared/lib/receiptText';
import { kitchenTicketBlocks } from '../../shared/lib/kitchenTicket';
import type { Block } from '../../shared/lib/escpos';
import { usePrinterSetting } from '../hooks/usePrinterSetting';

export type PrintDocs = 'bill' | 'kot' | 'both';

/** Bill, kitchen ticket, or both — as blocks the encoder understands. */
export function documentsFor(
  which: PrintDocs,
  order: ReceiptOrder,
  business: ReceiptBusiness,
  width: PaperWidth
): { label: string; blocks: Block[] }[] {
  const bill = { label: 'Bill', blocks: [{ text: receiptText(order, business, width) }] as Block[] };
  const kot = { label: 'Kitchen ticket', blocks: kitchenTicketBlocks(order, width) };
  if (which === 'bill') return [bill];
  if (which === 'kot') return [kot];
  return [bill, kot];
}

export function PrinterBar({ order, business, width }: {
  order: ReceiptOrder;
  business: ReceiptBusiness;
  width: PaperWidth;
}) {
  const { printer, autoPrint, choosePrinter, setAutoPrint } = usePrinterSetting();
  const [devices, setDevices] = useState<PairedPrinter[]>([]);
  const [docs, setDocs] = useState<PrintDocs>('both');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const refresh = async () => {
    setNote(null);
    try {
      await ensurePrinterPermission();
      setDevices(await listPairedPrinters());
    } catch (e) {
      setNote((e as Error).message);
    }
  };

  useEffect(() => {
    if (printerSupported()) void refresh();
  }, []);

  /** Prints each document in turn, reporting which one failed rather than a
   *  single failure for the pair — nobody should reprint a bill that printed. */
  const send = async () => {
    if (!printer) return;
    setBusy(true);
    setNote(null);
    setOk(false);
    const docsToPrint = documentsFor(docs, order, business, width);
    for (let i = 0; i < docsToPrint.length; i++) {
      const doc = docsToPrint[i];
      try {
        await printBlocks(printer.address, doc.blocks);
      } catch (e) {
        setNote(`${doc.label}: ${(e as Error).message}`);
        setBusy(false);
        return;
      }
      // Many SPP printers refuse a reconnect for a few hundred milliseconds
      // after a disconnect — pause between documents so the second one is
      // not the one that silently fails.
      if (i < docsToPrint.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, PRINTER_SETTLE_MS));
      }
    }
    setOk(true);
    setBusy(false);
    setTimeout(() => setOk(false), 2500);
  };

  if (!printerSupported()) return null;

  return (
    <div className="print:hidden mx-auto my-4 w-full max-w-md space-y-3 rounded-xl border border-cream-200 bg-white p-4 px-4">
      <div className="flex items-center justify-between gap-2">
        <select
          value={printer?.address ?? ''}
          onChange={(e) => choosePrinter(devices.find((d) => d.address === e.target.value) ?? null)}
          className="min-w-0 flex-1 rounded-lg border border-cream-300 px-2 py-1.5 text-sm"
        >
          <option value="">Choose a printer…</option>
          {/* The saved printer may be absent from `devices` (Bluetooth off,
              permission denied, refresh failed). Render it anyway so the
              select shows what is configured instead of going blank. */}
          {printer && !devices.some((d) => d.address === printer.address) && (
            <option value={printer.address}>{printer.name} (not found)</option>
          )}
          {devices.map((d) => (
            <option key={d.address} value={d.address}>{d.name}</option>
          ))}
        </select>
        <button type="button" onClick={refresh} aria-label="Look for printers"
          className="rounded-lg border border-cream-300 p-2 text-brand-600 hover:bg-cream-100">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <select value={docs} onChange={(e) => setDocs(e.target.value as PrintDocs)}
          className="rounded-lg border border-cream-300 px-2 py-1.5 text-sm">
          <option value="both">Bill + kitchen ticket</option>
          <option value="bill">Bill only</option>
          <option value="kot">Kitchen ticket only</option>
        </select>
        <button type="button" onClick={send} disabled={!printer || busy}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-900 px-3 py-1.5 text-sm font-semibold text-cream-50 disabled:opacity-60">
          {ok ? <Check className="h-4 w-4" /> : <Printer className="h-4 w-4" />}
          {busy ? 'Printing…' : ok ? 'Printed' : 'Print'}
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm text-brand-600">
        <input type="checkbox" checked={autoPrint} onChange={(e) => setAutoPrint(e.target.checked)}
          className="accent-brand-900" />
        Print automatically when an order is saved
      </label>

      {note && <p className="text-sm font-medium text-red-700">{note}</p>}
    </div>
  );
}
