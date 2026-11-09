// whatsapp-web.js flags a channel post's media but gives no URL for it, so the feed showed "Media
// unavailable" for every image, the ones the session itself posted included. The bytes are served by the
// same message media route a chat uses, keyed by the post's full serialized id; the post carries no media
// type, so the element is picked from the downloaded blob.
import '../../test-helpers/register-hooks.ts';
import { test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';

type RTL = typeof import('@testing-library/react');
type Api = {
  getMessageMediaBlob: (id: string, chatId: string, messageId: string, signal?: AbortSignal) => Promise<Blob>;
};

let rtl: RTL;
let ChannelMedia: typeof import('./ChannelMedia.tsx').default;
let api: Api;

before(async () => {
  const { installJsdomGlobals } = await import('../../test-helpers/jsdom.ts');
  await installJsdomGlobals();
  const { i18nReady } = await import('../../i18n/index.ts');
  await i18nReady;
  rtl = await import('@testing-library/react');
  ({ default: ChannelMedia } = await import('./ChannelMedia.tsx'));
  api = (await import('../../services/api.ts')).sessionApi as unknown as Api;
  URL.createObjectURL = (): string => 'blob:channel';
  URL.revokeObjectURL = (): void => undefined;
});

afterEach(() => rtl.cleanup());

async function renderWith(answer: () => Promise<Blob>) {
  const calls: string[][] = [];
  const original = api.getMessageMediaBlob;
  api.getMessageMediaBlob = (id, chatId, messageId) => {
    calls.push([id, chatId, messageId]);
    return answer();
  };
  const view = rtl.render(
    createElement(ChannelMedia, {
      sessionId: 's1',
      channelId: '123@newsletter',
      messageId: 'true_123@newsletter_3EB0AA',
    }),
  );
  return { ...view, calls, restore: () => (api.getMessageMediaBlob = original) };
}

test('an image post is fetched through the message media route by its full id and shown', async () => {
  const { container, calls, restore } = await renderWith(() =>
    Promise.resolve(new Blob(['x'], { type: 'image/jpeg' })),
  );
  try {
    await rtl.waitFor(() => assert.ok(container.querySelector('img.channel-media')));
    assert.deepEqual(calls, [['s1', '123@newsletter', 'true_123@newsletter_3EB0AA']]);
  } finally {
    restore();
  }
});

test('a video post renders as a video, picked from the blob type', async () => {
  const { container, restore } = await renderWith(() => Promise.resolve(new Blob(['x'], { type: 'video/mp4' })));
  try {
    await rtl.waitFor(() => assert.ok(container.querySelector('video.channel-media')));
    assert.equal(container.querySelector('img'), null);
  } finally {
    restore();
  }
});

test('a download that fails keeps the unavailable placeholder', async () => {
  const { container, restore } = await renderWith(() =>
    Promise.reject(Object.assign(new Error('Not Found'), { status: 404 })),
  );
  try {
    await rtl.waitFor(() => assert.ok(container.querySelector('.status-media-placeholder')));
  } finally {
    restore();
  }
});

// Logout cancels nothing in flight: a download that lands after the stored key changed must not show its
// media, nor retry a refusal under the new key (keepsSameKey).
test('a download that lands after the key changed shows nothing and is not retried', async () => {
  window.sessionStorage.setItem('openwa_api_key', 'k1');
  let calls = 0;
  const { container, restore } = await renderWith(() => {
    calls += 1;
    window.sessionStorage.setItem('openwa_api_key', 'k2');
    return Promise.reject(Object.assign(new Error('Too Many Requests'), { status: 429 }));
  });
  try {
    await new Promise(resolve => setTimeout(resolve, 1500));
    assert.equal(calls, 1);
    assert.equal(container.querySelector('img, video, audio, .status-media-placeholder'), null);
  } finally {
    restore();
    window.sessionStorage.removeItem('openwa_api_key');
  }
});
