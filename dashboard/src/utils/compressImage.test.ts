import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { CHANNEL_BATCH_MAX_BYTES, compressImage, fitsBatch, targetSize } from './compressImage.ts';

test('a landscape photo larger than the cap shrinks to 2048 on its long side, keeping the ratio', () => {
  assert.deepEqual(targetSize(4032, 3024, 2048), { width: 2048, height: 1536 });
});

test('a portrait photo shrinks on its height', () => {
  assert.deepEqual(targetSize(3024, 4032, 2048), { width: 1536, height: 2048 });
});

test('an image already within the cap is never enlarged', () => {
  assert.deepEqual(targetSize(800, 600, 2048), { width: 800, height: 600 });
});

test('fitsBatch accepts exactly the cap and refuses one byte over', () => {
  assert.equal(fitsBatch([{ bytes: CHANNEL_BATCH_MAX_BYTES - 10 }, { bytes: 10 }]), true);
  assert.equal(fitsBatch([{ bytes: CHANNEL_BATCH_MAX_BYTES }, { bytes: 1 }]), false);
});

const originalCreateImageBitmap = (globalThis as Record<string, unknown>).createImageBitmap;
const originalDocument = (globalThis as Record<string, unknown>).document;
afterEach(() => {
  (globalThis as Record<string, unknown>).createImageBitmap = originalCreateImageBitmap;
  (globalThis as Record<string, unknown>).document = originalDocument;
});

test('compressImage draws at the target size and encodes a JPEG at the given quality', async () => {
  const drawn: number[][] = [];
  let encoded: { type: string; quality: number } | null = null;
  (globalThis as Record<string, unknown>).createImageBitmap = async () => ({ width: 4000, height: 2000, close() {} });
  (globalThis as Record<string, unknown>).document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        fillRect() {},
        drawImage: (_b: unknown, x: number, y: number, w: number, h: number) => drawn.push([x, y, w, h]),
      }),
      toBlob(cb: (b: Blob) => void, type: string, quality: number) {
        encoded = { type, quality };
        cb(new Blob([new Uint8Array([1, 2, 3])], { type }));
      },
    }),
  };

  const out = await compressImage(new Blob(['x'], { type: 'image/png' }) as File, { maxSide: 2048, quality: 0.85 });

  assert.deepEqual(drawn, [[0, 0, 2048, 1024]]);
  assert.deepEqual(encoded, { type: 'image/jpeg', quality: 0.85 });
  assert.equal(out.mimetype, 'image/jpeg');
  assert.equal(out.bytes, 3);
  assert.equal(out.base64, 'AQID');
});

test('a transparent image is flattened onto white before encoding, not onto JPEG black', async () => {
  const calls: string[] = [];
  (globalThis as Record<string, unknown>).createImageBitmap = async () => ({ width: 100, height: 50, close() {} });
  (globalThis as Record<string, unknown>).document = {
    createElement: () => {
      const ctx = {
        fillStyle: '',
        fillRect: (x: number, y: number, w: number, h: number) =>
          calls.push(`fill:${ctx.fillStyle}:${x},${y},${w},${h}`),
        drawImage: () => calls.push('draw'),
      };
      return {
        width: 0,
        height: 0,
        getContext: () => ctx,
        toBlob: (cb: (b: Blob) => void, type: string) => cb(new Blob([new Uint8Array(1)], { type })),
      };
    },
  };

  await compressImage(new Blob(['x'], { type: 'image/png' }));

  assert.deepEqual(calls, ['fill:#ffffff:0,0,100,50', 'draw']);
});
