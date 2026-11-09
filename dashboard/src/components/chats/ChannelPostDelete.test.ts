// The channel feed had no way to take a post down. The owner or an admin deletes one from its bubble, after
// a confirmation, through the same delete route a chat message uses; the post leaves the feed at once.
import '../../test-helpers/register-hooks.ts';
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type ReactNode } from 'react';
import type { QueryClient } from '@tanstack/react-query';

let rtl: typeof import('@testing-library/react');
let ChannelPostDelete: (typeof import('./ChannelPostDelete.tsx'))['default'];
let wrap: (children: ReactNode) => ReactNode;
let queryClient: QueryClient;
const sent: { path: string; body: Record<string, unknown> }[] = [];
let nextStatus = 200;
let confirmAnswer = true;

const KEY = ['channel-messages', 's1', '123@newsletter'];
const POST = 'true_123@newsletter_3EB0AA';

before(async () => {
  const { installJsdomGlobals } = await import('../../test-helpers/jsdom.ts');
  await installJsdomGlobals();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({
      path: new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost').pathname,
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    });
    const ok = nextStatus < 400;
    return new Response(JSON.stringify(ok ? { success: true } : { message: 'not allowed' }), {
      status: nextStatus,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  window.confirm = () => confirmAnswer;
  const { i18nReady } = await import('../../i18n/index.ts');
  await i18nReady;
  rtl = await import('@testing-library/react');
  const { QueryClient: QC, QueryClientProvider } = await import('@tanstack/react-query');
  const { ToastProvider } = await import('../Toast.tsx');
  queryClient = new QC();
  wrap = children =>
    createElement(QueryClientProvider, { client: queryClient }, createElement(ToastProvider, null, children));
  ({ default: ChannelPostDelete } = await import('./ChannelPostDelete.tsx'));
});

afterEach(() => {
  rtl.cleanup();
  sent.length = 0;
  nextStatus = 200;
  confirmAnswer = true;
});

function renderButton() {
  queryClient.setQueryData(KEY, [
    { id: POST, body: '', timestamp: 1, hasMedia: true },
    { id: 'true_123@newsletter_OTHER', body: 'keep', timestamp: 2, hasMedia: false },
  ]);
  return rtl.render(
    wrap(createElement(ChannelPostDelete, { sessionId: 's1', channelId: '123@newsletter', messageId: POST })),
  );
}

const button = () => rtl.screen.getByRole('button', { name: 'Delete message' });
const feedIds = () => (queryClient.getQueryData<{ id: string }[]>(KEY) ?? []).map(m => m.id);

test('a confirmed delete revokes the post for everyone and drops it from the feed', async () => {
  renderButton();
  rtl.fireEvent.click(button());
  await rtl.waitFor(() => assert.deepEqual(feedIds(), ['true_123@newsletter_OTHER']));
  assert.deepEqual(sent, [
    {
      path: '/api/sessions/s1/messages/delete',
      body: { chatId: '123@newsletter', messageId: POST, forEveryone: true },
    },
  ]);
});

test('a declined confirmation sends nothing', async () => {
  confirmAnswer = false;
  renderButton();
  rtl.fireEvent.click(button());
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(sent.length, 0);
  assert.equal(feedIds().length, 2);
});

test('a refused delete keeps the post and says why', async () => {
  nextStatus = 403;
  renderButton();
  rtl.fireEvent.click(button());
  await rtl.screen.findByText(/not allowed/);
  assert.equal(feedIds().length, 2);
});

// setQueryData with no observer schedules a garbage-collection timer that would keep the run alive.
after(() => queryClient.clear());
