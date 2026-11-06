// The input bar shared by the chat composer and the channel post bar: presentational only, so each
// caller decides what the attach button does, whether an emoji toggle exists, and when send is allowed.
import '../../test-helpers/register-hooks.ts';
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';

let rtl: typeof import('@testing-library/react');
let ComposerInputBar: (typeof import('./ComposerInputBar.tsx'))['default'];

before(async () => {
  const { installJsdomGlobals } = await import('../../test-helpers/jsdom.ts');
  await installJsdomGlobals();
  const { i18nReady } = await import('../../i18n/index.ts');
  await i18nReady;
  rtl = await import('@testing-library/react');
  ({ default: ComposerInputBar } = await import('./ComposerInputBar.tsx'));
});

afterEach(() => rtl.cleanup());
after(() => rtl.cleanup());

const baseProps = {
  value: 'hi',
  onChange: () => undefined,
  onSubmit: () => undefined,
  placeholder: 'Type',
  canWrite: true,
  sending: false,
  canSubmit: true,
  attach: { onClick: () => undefined, disabled: false, title: 'Attach' },
};

test('a disabled attach button carries the caller title as tooltip and label', () => {
  rtl.render(createElement(ComposerInputBar, { ...baseProps, attach: { ...baseProps.attach, disabled: true, title: 'X' } }));
  const attach = rtl.screen.getByRole('button', { name: 'X' }) as HTMLButtonElement;
  assert.equal(attach.disabled, true);
  assert.equal(attach.title, 'X');
});

test('no emoji prop renders no emoji toggle', () => {
  rtl.render(createElement(ComposerInputBar, baseProps));
  assert.equal(rtl.screen.queryByRole('button', { name: 'Pick emoji' }), null);
});

test('an emoji prop renders the toggle', () => {
  rtl.render(createElement(ComposerInputBar, { ...baseProps, emoji: { onToggle: () => undefined, active: false } }));
  assert.ok(rtl.screen.getByRole('button', { name: 'Pick emoji' }));
});

test('canSubmit=false disables send', () => {
  rtl.render(createElement(ComposerInputBar, { ...baseProps, canSubmit: false }));
  assert.equal((rtl.screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled, true);
});
