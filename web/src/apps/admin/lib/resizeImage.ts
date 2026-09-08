/**
 * Shrink a chosen photo in the browser before uploading it.
 *
 * WHY HERE AND NOT ON THE SERVER
 * Resizing server-side needs GD or Imagick, and neither is guaranteed on this
 * stack — the development machine has neither, and shared hosting varies. Doing
 * it in the browser removes that dependency entirely, and has a second payoff
 * that matters more in practice: a counter phone uploads roughly 60 KB instead
 * of the four megabytes its camera produced, over mobile data, while a customer
 * waits at the till.
 *
 * The output matches what the photo pipeline produces for the dishes shot
 * professionally (800px square, WebP), so an admin-uploaded photo sits beside
 * those without looking out of place.
 */

const SIZE = 800;
const QUALITY = 0.82;

/** Draw `img` centre-cropped to a SIZE×SIZE square, the way object-cover would. */
function drawCentreCropped(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not process this image.');

  // White rather than transparent: the studio photos are on white, and a
  // transparent PNG would otherwise flatten to black in a JPEG fallback.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SIZE, SIZE);

  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
  return canvas;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };
    img.src = url;
  });
}

/**
 * Returns a square 800px WebP blob, or JPEG where WebP encoding is unavailable
 * (older Safari). The server accepts both and stores whichever arrives.
 */
export async function resizeForUpload(file: File): Promise<Blob> {
  const img = await loadImage(file);
  const canvas = drawCentreCropped(img);

  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY));

  // toBlob reports an unsupported type by handing back null or a PNG, so check
  // what actually came back rather than trusting the request.
  const webp = await encode('image/webp');
  if (webp && webp.type === 'image/webp') return webp;

  const jpeg = await encode('image/jpeg');
  if (jpeg) return jpeg;

  throw new Error('Your browser could not prepare this image for upload.');
}
