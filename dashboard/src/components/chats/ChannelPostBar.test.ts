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
}
const sent: Sent[] = [];
let nextStatus = 200;
let release: (() => void) | null = null;
let holdNext = false;
const invalidated: unknown[][] = [];

before(async () => {
  const { installJsdomGlobals } = await import('../../test-helpers/jsdom.ts');
  await installJsdomGlobals();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({
      path: new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost').pathname,
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    });
    if (holdNext) await new Promise<void>(resolve => (release = resolve));
    const ok = nextStatus < 400;
    return new Response(JSON.stringify(ok ? { messageId: 'm1' } : { message: 'boom' }), {
      status: nextStatus,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
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
});

after(() => rtl.cleanup());

const PLACEHOLDER = 'Post to the channel…';

function renderBar() {
  return rtl.render(wrap(createElement(ChannelPostBar, { sessionId: 's1', channelId: 'c@newsletter' })));
}

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
