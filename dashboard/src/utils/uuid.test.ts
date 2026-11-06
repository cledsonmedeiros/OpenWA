import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newUuid } from './uuid.ts';

test('without crypto.randomUUID (plain HTTP on a LAN address) it still makes a valid v4 UUID', () => {
  const original = crypto.randomUUID;
  Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
  try {
    const id = newUuid();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.notEqual(newUuid(), id);
  } finally {
    Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
  }
});
