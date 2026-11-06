import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChannelTextOptions, canPostToChannel } from './channelPosting.ts';

for (const [role, canWrite, expected] of [
  ['owner', true, true],
  ['admin', true, true],
  ['subscriber', true, false],
  ['unknown', true, false],
  [undefined, true, false],
  ['owner', false, false],
  ['admin', false, false],
] as const) {
  test(`canPostToChannel(${String(role)}, ${canWrite}) is ${expected}`, () => {
    assert.equal(canPostToChannel({ role }, canWrite), expected);
  });
}

test('preview on omits linkPreview, so the engine builds its default preview', () => {
  assert.deepEqual(buildChannelTextOptions(true), {});
});

test('preview off sends linkPreview:false', () => {
  assert.deepEqual(buildChannelTextOptions(false), { linkPreview: false });
});
