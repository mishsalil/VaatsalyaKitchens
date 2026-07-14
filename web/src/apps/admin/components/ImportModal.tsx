import { useRef, useState, type ReactNode } from 'react';
import { Download, Upload, Loader2, FileText } from 'lucide-react';
import { Modal } from '../../shared/components/ui/Modal';
import { Button } from '../../shared/components/ui/Button';
import { useToast } from '../../shared/context/ToastContext';
import { downloadBlob } from '../../shared/lib/download';
import type { ImportResult } from './ImportExportBar';

/**
 * Import CSV modal: a short format blurb, a "Download sample CSV" button, a
 * file picker, and Import / Cancel. On import it calls onImport(file), toasts
 * the counts, calls onImported(), and closes. `sampleCsv` (when provided) is
 * the exact-format sample string to download.
 */
export function ImportModal({
  open,
  onClose,
  entity,
  sampleFilename,
  sampleCsv,
  blurb,
  onImport,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  entity: string;
  sampleFilename: string;
  sampleCsv?: string;
  blurb?: ReactNode;
  onImport: (file: File) => Promise<ImportResult>;
  onImported?: () => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const downloadSample = () => {
    if (!sampleCsv) return;
    downloadBlob(new Blob([sampleCsv], { type: 'text/csv;charset=utf-8' }), sampleFilename);
    toast.success('Sample CSV downloaded');
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
  };

  const runImport = async () => {
    if (!file) {
      toast.error('Please choose a CSV file first.');
      return;
    }
    setBusy(true);
    try {
      const res = await onImport(file);
      const parts: string[] = [];
      if (res.created) parts.push(`created ${res.created}`);
      if (res.updated) parts.push(`updated ${res.updated}`);
      if (res.skipped) parts.push(`skipped ${res.skipped}`);
      if (res.categories_created) parts.push(`new categories ${res.categories_created}`);
      const summary = parts.length ? parts.join(' · ') : 'No changes';
      const errCount = res.errors?.length ?? 0;
      toast.success(`${entity} imported — ${summary}${errCount ? ` · ${errCount} row(s) with errors` : ''}`);
      onImported?.();
      setFile(null);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Import ${entity} CSV`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={runImport} disabled={busy || !file}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {busy ? 'Importing…' : 'Import'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {blurb && <div className="rounded-xl bg-cream-50 p-3 text-xs text-brand-600">{blurb}</div>}

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">Not sure of the format?</p>
          <p className="mt-1 text-xs text-brand-500">Download a ready sample, fill it in, then upload it below.</p>
          <button
            type="button"
            onClick={downloadSample}
            disabled={!sampleCsv}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-brand-200 px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-cream-100 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> Download sample CSV
          </button>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">Choose your CSV file</p>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onPick} className="mt-2 block w-full text-xs text-brand-600 file:mr-3 file:rounded-full file:border-0 file:bg-brand-900 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-cream-50 hover:file:bg-brand-800" />
          {file && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-brand-700">
              <FileText className="h-3.5 w-3.5" /> {file.name}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}