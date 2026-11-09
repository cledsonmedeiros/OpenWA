/**
 * Shrinks photos before a channel image batch so up to ten of them fit one request. The gateway body
 * limit is 25 MB by default and base64 inflates by a third, so the batch is capped at 18 MiB of
 * compressed bytes — the same per-request budget the dashboard already keeps for a single upload.
 */
export const CHANNEL_BATCH_MAX_BYTES = 18 * 1024 * 1024;
export const CHANNEL_IMAGE_MAX_SIDE = 2048;
export const CHANNEL_IMAGE_QUALITY = 0.85;

export interface CompressedImage {
  base64: string;
  mimetype: 'image/jpeg';
  bytes: number;
}

/** The size to draw at: the long side at most `maxSide`, the ratio kept, never enlarged. */
export function targetSize(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function fitsBatch(items: { bytes: number }[]): boolean {
  return items.reduce((sum, item) => sum + item.bytes, 0) <= CHANNEL_BATCH_MAX_BYTES;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Decode, resize and re-encode as JPEG, transparent areas flattened onto white. */
export async function compressImage(
  file: Blob,
  opts: { maxSide?: number; quality?: number } = {},
): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = targetSize(bitmap.width, bitmap.height, opts.maxSide ?? CHANNEL_IMAGE_MAX_SIDE);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas 2d context unavailable');
    // JPEG has no alpha: without a backdrop the transparent pixels of a PNG encode as black.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        b => (b ? resolve(b) : reject(new Error('image encoding failed'))),
        'image/jpeg',
        opts.quality ?? CHANNEL_IMAGE_QUALITY,
      ),
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { base64: toBase64(bytes), mimetype: 'image/jpeg', bytes: bytes.length };
  } finally {
    bitmap.close();
  }
}
