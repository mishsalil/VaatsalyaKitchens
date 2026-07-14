import { useState, type ReactNode } from 'react';
import { Download, Upload, Loader2 } from 'lucide-react';
import { Button } from '../../shared/components/ui/Button';
import { useToast } from '../../shared/context/ToastContext';
import { downloadBlob } from '../../shared/lib/download';
import { ImportModal } from './ImportModal';

/** Generic import result — each entity fills the fields it reports. */
export interface ImportResult {
  created: number;
  updated?: number;
  skipped?: number;
  categories_created?: number;
  subcategories_created?: number;
  errors: { row: number; msg: string }[];
}

/**
 * A compact CSV import/export row. Export fetches a text/csv blob (bypassing
 * the JSON admin client) and triggers a download. Import opens an ImportModal
 * (with a downloadable sample, when `sampleCsv` is provided) that posts the
 * chosen file, toasts the counts, and calls onImported so the page refetches.
 */
export function ImportExportBar({
  entity,
  filename,
  sampleCsv,
  sampleFilename,
  blurb,
  onExport,
  onImport,
  onImported,
}: {
  entity: string;
  filename: string;
  /** Sample CSV string offered in the import modal (omitted = no sample button). */
  sampleCsv?: string;
  /** Filename for the sample download (defaults to `sample-${filename}`). */
  sampleFilename?: string;
  /** Short format blurb shown in the import modal. */
  blurb?: ReactNode;
  onExport: () => Promise<Blob>;
  onImport?: (file: File) => Promise<ImportResult>;
  onImported?: () => void;
}) {
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const doExport = async () => {
    setExporting(true);
    try {
      const blob = await onExport();
      downloadBlob(blob, filename);
      toast.success(`${entity} exported`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={doExport} disabled={exporting}>
        {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {exporting ? 'Exporting…' : 'Export CSV'}
      </Button>
      {onImport && (
        <>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" /> Import CSV
          </Button>
          <ImportModal
            open={importOpen}
            onClose={() => setImportOpen(false)}
            entity={entity}
            sampleFilename={sampleFilename ?? `sample-${filename}`}
            sampleCsv={sampleCsv}
            blurb={blurb}
            onImport={onImport}
            onImported={onImported}
          />
        </>
      )}
    </div>
  );
}