import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { adminMenuImageApi } from '../api/endpoints';
import { resizeForUpload } from '../lib/resizeImage';
import { useToast } from '../../shared/context/ToastContext';
import { mediaUrl } from '../../shared/lib/baseUrl';

const SLOTS = [1, 2, 3] as const;

/**
 * Up to three photos for a dish, managed inside the item editor.
 *
 * SLOTS, NOT A LIST. Each photo has a fixed position on disk ({id}.webp,
 * {id}-2.webp, {id}-3.webp), so the editor addresses them by slot rather than
 * by index. That keeps "replace the second photo" a single operation and means
 * removing the first does not silently renumber the others.
 *
 * The first slot is the one customers see on the menu tile; the others appear
 * when they open the photo. That is worth saying out loud in the UI, because it
 * is not guessable.
 *
 * Only available on a saved item — an unsaved one has no id yet, and the file
 * name is derived from it.
 */
export function DishPhotoSlots({
  itemId,
  itemName,
  initial,
}: {
  itemId?: number;
  itemName: string;
  /** Slot number → URL, as the admin API reports it. */
  initial?: Record<string, string>;
}) {
  const toast = useToast();
  const [photos, setPhotos] = useState<Record<number, string>>(() => {
    const out: Record<number, string> = {};
    for (const [slot, url] of Object.entries(initial ?? {})) out[Number(slot)] = url;
    return out;
  });
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const inputs = useRef<Record<number, HTMLInputElement | null>>({});

  if (!itemId) {
    return (
      <div className="rounded-xl border border-dashed border-cream-300 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">Photos</p>
        <p className="mt-1 text-xs text-brand-500">Save the item first, then add up to three photos.</p>
      </div>
    );
  }

  const upload = async (slot: number, file: File) => {
    setBusySlot(slot);
    try {
      const blob = await resizeForUpload(file);
      const { url } = await adminMenuImageApi.upload(itemId, slot, blob);
      // Cache-bust: the filename does not change when a photo is replaced, so
      // without this the editor would keep showing the previous picture.
      setPhotos((p) => ({ ...p, [slot]: `${url}?v=${Date.now()}` }));
      toast.info(`Photo ${slot} updated for ${itemName}.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusySlot(null);
      const input = inputs.current[slot];
      if (input) input.value = '';
    }
  };

  const remove = async (slot: number) => {
    setBusySlot(slot);
    try {
      await adminMenuImageApi.remove(itemId, slot);
      setPhotos((p) => {
        const next = { ...p };
        delete next[slot];
        return next;
      });
      toast.info(`Photo ${slot} removed from ${itemName}.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusySlot(null);
    }
  };

  return (
    <div className="rounded-xl border border-cream-200 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">Photos</p>
      <p className="mt-0.5 text-xs text-brand-400">
        The first is shown on the menu. Customers see the rest when they tap it.
      </p>

      <div className="mt-3 flex gap-3">
        {SLOTS.map((slot) => {
          const url = photos[slot];
          const busy = busySlot === slot;
          return (
            <div key={slot} className="flex flex-col items-center gap-1">
              <input
                ref={(el) => {
                  inputs.current[slot] = el;
                }}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(slot, f);
                }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => inputs.current[slot]?.click()}
                aria-label={url ? `Replace photo ${slot} for ${itemName}` : `Add photo ${slot} for ${itemName}`}
                className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-cream-300 bg-cream-50 text-brand-300 transition-colors hover:border-brand-400 hover:text-brand-600 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : url ? (
                  <img src={mediaUrl(url)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="h-5 w-5" />
                )}
              </button>
              {url && !busy ? (
                <button
                  type="button"
                  onClick={() => remove(slot)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-500 hover:text-red-700"
                >
                  <Trash2 className="h-3 w-3" /> Remove
                </button>
              ) : (
                <span className="text-[11px] text-brand-300">{slot === 1 ? 'Main' : `Photo ${slot}`}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
