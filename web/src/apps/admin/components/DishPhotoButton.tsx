import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { adminMenuImageApi } from '../api/endpoints';
import { resizeForUpload } from '../lib/resizeImage';
import { useToast } from '../../shared/context/ToastContext';

/**
 * The photo cell on a menu item row: shows the dish photo if there is one,
 * and takes a new one either way.
 *
 * There is no database column for this — a dish has a photo exactly when
 * /menu/{id}.webp exists — so presence is discovered the same way the
 * storefront's DishImage discovers it: try to load it, and fall back when it
 * 404s. That keeps one source of truth (the file) instead of a flag that can
 * disagree with the disk.
 *
 * The preview carries a cache-busting version because the URL never changes
 * when a photo is replaced; without it the admin would upload a new picture and
 * keep seeing the old one.
 */
export function DishPhotoButton({ itemId, itemName }: { itemId: number; itemName: string }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [ext, setExt] = useState<'webp' | 'jpg' | 'png' | null>('webp');
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);

  const src = ext ? `/menu/${itemId}.${ext}${version ? `?v=${version}` : ''}` : null;

  const pick = async (file: File) => {
    setBusy(true);
    try {
      const blob = await resizeForUpload(file);
      await adminMenuImageApi.upload(itemId, blob);
      setExt('webp');
      setVersion(Date.now());
      toast.info(`Photo updated for ${itemName}.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await adminMenuImageApi.remove(itemId);
      setExt(null);
      toast.info(`Photo removed from ${itemName}.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative shrink-0">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pick(f);
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        title={src ? `Replace the photo for ${itemName}` : `Add a photo for ${itemName}`}
        aria-label={src ? `Replace the photo for ${itemName}` : `Add a photo for ${itemName}`}
        className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg border border-cream-300 bg-cream-50 text-brand-300 transition-colors hover:border-brand-400 hover:text-brand-600 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : src ? (
          <img
            src={src}
            alt=""
            className="h-full w-full object-cover"
            /* Walk the same extensions DishImage does, then give up and show
               the "add a photo" state rather than a broken image. */
            onError={() => setExt(ext === 'webp' ? 'jpg' : ext === 'jpg' ? 'png' : null)}
          />
        ) : (
          <ImagePlus className="h-4 w-4" />
        )}
      </button>

      {src && !busy && (
        <button
          type="button"
          onClick={remove}
          title={`Remove the photo from ${itemName}`}
          aria-label={`Remove the photo from ${itemName}`}
          className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-900 text-cream-50 hover:bg-red-700"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}
