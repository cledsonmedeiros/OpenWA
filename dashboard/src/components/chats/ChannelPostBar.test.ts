// The channel pane's post bar: text (with an optional link preview) through send-text, no optimistic
// bubble — the feed shows the post after a refetch — and a failed send keeps what the operator typed.
import '../../test-helpers/register-hooks.ts';
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type ReactNode } from 'react';
import type { QueryClient } from '@tanstack/react-query';

let rtl: typeof import('@testing-library/react');
let ChannelPostBar: (typeof import('./ChannelPostBar.tsx'))['default'];
let wrap: (children: ReactNode) => ReactNode;
let queryClient: QueryClient;

interface Sent {
  path: string;
  body: Record<string, unknown>;
  idempotencyKey?: string | null;
}
const sent: Sent[] = [];
let nextStatus = 200;
let release: (() => void) | null = null;
let holdNext = false;
// The body the next answer carries; the text send answers { messageId } by default.
let nextBody: unknown = null;
// Bytes each stubbed JPEG encode produces, to drive the batch size cap.
let encodedBytes = 3;
const invalidated: unknown[][] = [];

before(async () => {
  const { installJsdomGlobals } = await import('../../test-helpers/jsdom.ts');
  await installJsdomGlobals();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({
      path: new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost').pathname,
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
      ...(new Headers(init?.headers).get('Idempotency-Key')
        ? { idempotencyKey: new Headers(init?.headers).get('Idempotency-Key') }
        : {}),
    });
    if (holdNext) await new Promise<void>(resolve => (release = resolve));
    const ok = nextStatus < 400;
    return new Response(JSON.stringify(nextBody ?? (ok ? { messageId: 'm1' } : { message: 'boom' })), {
      status: nextStatus,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  // Node's URL.createObjectURL takes only its own Blob, not jsdom's File; the tray only needs a src.
  let objectUrls = 0;
  URL.createObjectURL = () => `blob:preview-${++objectUrls}`;
  URL.revokeObjectURL = () => undefined;
  // jsdom decodes no images and has no 2d canvas: stub the two calls compressImage makes.
  (globalThis as Record<string, unknown>).createImageBitmap = () => Promise.resolve({ width: 4000, height: 3000, close() {} });
  const canvasProto = window.HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
  canvasProto.getContext = () => ({ drawImage() {} });
  canvasProto.toBlob = function (cb: (b: Blob) => void, type: string) {
    cb(new Blob([new Uint8Array(encodedBytes)], { type }));
  };
  const { i18nReady } = await import('../../i18n/index.ts');
  await i18nReady;
  rtl = await import('@testing-library/react');
  const { QueryClient: QC, QueryClientProvider } = await import('@tanstack/react-query');
  const { ToastProvider } = await import('../Toast.tsx');
  const { RoleContext } = await import('../../hooks/useRole.tsx');
  queryClient = new QC();
  const original = queryClient.invalidateQueries.bind(queryClient);
  queryClient.invalidateQueries = ((filters?: { queryKey?: unknown[] }) => {
    invalidated.push(filters?.queryKey ?? []);
    return original(filters);
  }) as typeof queryClient.invalidateQueries;
  const role = {
    role: 'admin' as const,
    setRole: () => undefined,
    isAdmin: true,
    isOperator: false,
    isViewer: false,
    canWrite: true,
    engineType: 'whatsapp-web.js',
    setEngineType: () => undefined,
    scoped: false,
    setScoped: () => undefined,
  };
  wrap = children =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(RoleContext.Provider, { value: role }, createElement(ToastProvider, null, children)),
    );
  ({ default: ChannelPostBar } = await import('./ChannelPostBar.tsx'));
});

afterEach(() => {
  rtl.cleanup();
  sent.length = 0;
  invalidated.length = 0;
  nextStatus = 200;
  holdNext = false;
  release = null;
  nextBody = null;
  encodedBytes = 3;
});

after(() => rtl.cleanup());

const PLACEHOLDER = 'Post to the channel…';

function renderBar(props: { mediaSupported?: boolean; progress?: unknown } = {}) {
  return rtl.render(wrap(createElement(ChannelPostBar, { sessionId: 's1', channelId: 'c@newsletter', ...props } as never)));
}

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const pick = (names: string[]) =>
  rtl.fireEvent.change(fileInput(), {
    target: { files: names.map(n => new window.File(['x'], n, { type: 'image/png' })) },
  });
const trayNames = () => [...document.querySelectorAll('.channel-image-tray [data-name]')].map(e => e.getAttribute('data-name'));
const BATCH_PATH = '/api/sessions/s1/channels/c%40newsletter/posts/images';

function type(text: string) {
  rtl.fireEvent.change(rtl.screen.getByPlaceholderText(PLACEHOLDER), { target: { value: text } });
}

const input = () => rtl.screen.getByPlaceholderText(PLACEHOLDER) as HTMLInputElement;
const sendButton = () => rtl.screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;

test('sends text through send-text without linkPreview and clears the field', async () => {
  renderBar();
  type('Veja https://x.y');
  rtl.fireEvent.click(sendButton());
  await rtl.waitFor(() => assert.equal(input().value, ''));
  assert.deepEqual(sent, [
    { path: '/api/sessions/s1/messages/send-text', body: { chatId: 'c@newsletter', text: 'Veja https://x.y' } },
  ]);
});

test('turning the preview off sends linkPreview:false', async () => {
  renderBar();
  rtl.fireEvent.click(rtl.screen.getByRole('checkbox', { name: 'Generate link preview' }));
  type('Veja https://x.y');
  rtl.fireEvent.click(sendButton());
  await rtl.waitFor(() => assert.equal(sent.length, 1));
  assert.equal(sent[0].body.linkPreview, false);
});

test('a successful send refetches the channel feed', async () => {
  renderBar();
  type('oi');
  rtl.fireEvent.click(sendButton());
  await rtl.waitFor(() => assert.deepEqual(invalidated, [['channel-messages', 's1', 'c@newsletter']]));
});

test('a failed send keeps the text, shows a toast and refetches the channel list', async () => {
  nextStatus = 500;
  renderBar();
  type('não perca');
  rtl.fireEvent.click(sendButton());
  await rtl.waitFor(() => assert.ok(rtl.screen.getByText('Failed to send message')));
  assert.equal(input().value, 'não perca');
  assert.deepEqual(invalidated, [['channels', 's1']]);
});

test('whitespace-only text cannot be sent', () => {
  renderBar();
  type('   ');
  assert.equal(sendButton().disabled, true);
  rtl.fireEvent.submit(input().form!);
  assert.equal(sent.length, 0);
});

test('a second submit while the first is in flight sends nothing more', async () => {
  holdNext = true;
  renderBar();
  type('uma vez');
  rtl.fireEvent.submit(input().form!);
  rtl.fireEvent.submit(input().form!);
  await rtl.waitFor(() => assert.ok(release));
  release!();
  await rtl.waitFor(() => assert.equal(input().value, ''));
  assert.equal(sent.length, 1);
});

test('the attach button is visible but disabled with the engine limitation as tooltip', () => {
  renderBar();
  const title = 'Sending media to channels is not supported on the whatsapp-web.js engine.';
  const attach = rtl.screen.getByRole('button', { name: title }) as HTMLButtonElement;
  assert.equal(attach.disabled, true);
  assert.equal(attach.title, title);
});

test('with mediaSupported the attach button opens a multi-image picker', () => {
  renderBar({ mediaSupported: true });
  const attach = rtl.screen.getByRole('button', { name: 'Attach images' }) as HTMLButtonElement;
  assert.equal(attach.disabled, false);
  assert.equal(fileInput().multiple, true);
  assert.equal(fileInput().accept, 'image/*');
});

test('picking more than 10 images keeps the first 10 and says so', async () => {
  renderBar({ mediaSupported: true });
  pick(Array.from({ length: 11 }, (_, i) => `p${i}.png`));
  await rtl.waitFor(() => assert.equal(trayNames().length, 10));
  assert.ok(rtl.screen.getByText('A channel post takes up to 10 images; the extra ones were left out.'));
});

test('moving an image down reorders the tray, and the batch goes out in that order with the text position', async () => {
  nextBody = { mode: 'individual', sent: [0, 1, 2].map(index => ({ index, messageId: `m${index}` })) };
  renderBar({ mediaSupported: true });
  pick(['a.png', 'b.png', 'c.png']);
  await rtl.waitFor(() => assert.deepEqual(trayNames(), ['a.png', 'b.png', 'c.png']));
  rtl.fireEvent.click(rtl.screen.getByRole('button', { name: 'Move a.png down' }));
  assert.deepEqual(trayNames(), ['b.png', 'a.png', 'c.png']);
  rtl.fireEvent.change(rtl.screen.getByRole('combobox', { name: 'Text position' }), { target: { value: 'before' } });
  type('legenda');
  rtl.fireEvent.click(sendButton());

  await rtl.waitFor(() => assert.equal(sent.length, 1));
  assert.equal(sent[0].path, BATCH_PATH);
  const body = sent[0].body as { postId: string; images: { mimetype: string }[]; text: string; textPosition: string };
  assert.match(body.postId, /^[0-9a-f-]{36}$/);
  assert.equal(body.images.length, 3);
  assert.equal(body.images[0].mimetype, 'image/jpeg');
  assert.equal(body.text, 'legenda');
  assert.equal(body.textPosition, 'before');
  await rtl.waitFor(() => assert.equal(trayNames().length, 0));
});

test('progress frames for this batch show "n of N" while it is sending', async () => {
  holdNext = true;
  const { rerender } = renderBar({ mediaSupported: true });
  pick(['a.png', 'b.png', 'c.png']);
  await rtl.waitFor(() => assert.equal(trayNames().length, 3));
  rtl.fireEvent.click(sendButton());
  await rtl.waitFor(() => assert.equal(sent.length, 1));
  const postId = (sent[0].body as { postId: string }).postId;
  rerender(
    wrap(
      createElement(ChannelPostBar, {
        sessionId: 's1',
        channelId: 'c@newsletter',
        mediaSupported: true,
        progress: { postId, channelId: 'c@newsletter', index: 1, total: 3, mode: 'individual', status: 'sent' },
      } as never),
    ),
  );
  assert.ok(rtl.screen.getByText('Sending 2 of 3…'));
  nextBody = { mode: 'individual', sent: [] };
  release!();
});

test('without a socket the final result still comes from the HTTP answer', async () => {
  nextBody = { mode: 'individual', sent: [{ index: 0, messageId: 'm0' }] };
  renderBar({ mediaSupported: true });
  pick(['a.png']);
  await rtl.waitFor(() => assert.equal(trayNames().length, 1));
  rtl.fireEvent.click(sendButton());
  await rtl.waitFor(() => assert.equal(trayNames().length, 0));
});

test('a partial batch says what went out and keeps the unsent images in the tray', async () => {
  nextStatus = 207;
  nextBody = { mode: 'individual', sent: [{ index: 0, messageId: 'm0' }], failedAt: 1, error: 'boom' };
  renderBar({ mediaSupported: true });
  pick(['a.png', 'b.png', 'c.png']);
  await rtl.waitFor(() => assert.equal(trayNames().length, 3));
  rtl.fireEvent.click(sendButton());
  await rtl.waitFor(() => assert.ok(rtl.screen.getByText('1 of 3 images were posted; the batch stopped there.')));
  assert.deepEqual(trayNames(), ['b.png', 'c.png']);
});

test('a batch over 18 MiB after compression warns and sends nothing', async () => {
  encodedBytes = 2 * 1024 * 1024;
  renderBar({ mediaSupported: true });
  pick(Array.from({ length: 10 }, (_, i) => `p${i}.png`));
  await rtl.waitFor(() => assert.equal(trayNames().length, 10));
  rtl.fireEvent.click(sendButton());
  await rtl.waitFor(() => assert.ok(rtl.screen.getByText('These images are too large to post together; remove some and try again.')));
  assert.equal(sent.length, 0);
});

test('a batch carries an Idempotency-Key, and a retry after a failure with nothing confirmed reuses it and the postId', async () => {
  nextStatus = 500;
  renderBar({ mediaSupported: true });
  pick(['a.png', 'b.png']);
  await rtl.waitFor(() => assert.equal(trayNames().length, 2));
  rtl.fireEvent.click(sendButton());
  await rtl.waitFor(() => assert.equal(sent.length, 1));
  await rtl.waitFor(() => assert.equal(sendButton().disabled, false));
  const first = sent[0];
  assert.match(String(first.idempotencyKey), /^[0-9a-f-]{36}$/);

  nextStatus = 201;
  nextBody = { mode: 'individual', sent: [] };
  rtl.fireEvent.click(sendButton());
  await rtl.waitFor(() => assert.equal(sent.length, 2));
  assert.equal(sent[1].idempotencyKey, first.idempotencyKey);
  assert.deepEqual(sent[1].body, first.body);
});

test('a failed HTTP answer after progress frames confirmed some images removes those from the tray', async () => {
  holdNext = true;
  nextStatus = 504;
  const { rerender } = renderBar({ mediaSupported: true });
  pick(['a.png', 'b.png', 'c.png']);
  await rtl.waitFor(() => assert.equal(trayNames().length, 3));
  rtl.fireEvent.click(sendButton());
  await rtl.waitFor(() => assert.equal(sent.length, 1));
  const postId = (sent[0].body as { postId: string }).postId;
  const frame = (index: number) =>
    wrap(
      createElement(ChannelPostBar, {
        sessionId: 's1',
        channelId: 'c@newsletter',
        mediaSupported: true,
        progress: { postId, channelId: 'c@newsletter', index, total: 3, mode: 'individual', status: 'sent' },
      } as never),
    );
  rerender(frame(0));
  rerender(frame(1));
  release!();
  await rtl.waitFor(() => assert.deepEqual(trayNames(), ['c.png']));
  assert.ok(rtl.screen.getByText('The connection failed mid-batch; 2 images confirmed as posted were removed. Check the channel before sending the rest.'));
});
