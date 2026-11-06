'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { applyPatch, isApplied, LEGACY, PATCHED } = require('./patch-wwebjs-channel-media.js');

// The channel-send block exactly as whatsapp-web.js 1.34.7 ships it (Utils.js, `if (isChannel)`).
const SHIPPED = `            const sendChannelMsgResponse = await window
                .require('WAWebNewsletterSendMessageJob')
                .sendNewsletterMessageJob({
                    msg: msg,`;

function makeDependency(source) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openwa-channel-media-'));
  const utils = path.join(root, 'src', 'util', 'Injected', 'Utils.js');
  fs.mkdirSync(path.dirname(utils), { recursive: true });
  fs.writeFileSync(utils, source);
  return { root, utils };
}

test('the legacy anchor is the block whatsapp-web.js ships', () => {
  assert.ok(SHIPPED.startsWith(LEGACY));
});

test('routes media sends through sendNewsletterMediaMsg and leaves text on the job', () => {
  const { root, utils } = makeDependency(`before\n${SHIPPED}\nafter\n`);

  assert.deepEqual(applyPatch(root), { skipped: false, note: 'channel media routed through sendNewsletterMediaMsg' });

  const out = fs.readFileSync(utils, 'utf8');
  assert.ok(out.includes(".sendNewsletterMediaMsg(chat, msg, () => Promise.resolve(msg))"));
  assert.ok(out.includes('isMedia\n'), 'the media branch is conditional on isMedia');
  assert.ok(out.includes(".require('WAWebNewsletterSendMessageJob')"), 'text and polls keep the job');
});

test('throws when WhatsApp gave the media post no server id, instead of acking a post that never landed', () => {
  const { root, utils } = makeDependency(`${SHIPPED}\n`);
  applyPatch(root);
  const out = fs.readFileSync(utils, 'utf8');
  assert.ok(out.includes("if (!msg.serverId) throw new Error('channel media send was not acknowledged by WhatsApp');"));
  // The action's own answer is never read: the code after it only takes ack.t/serverId on success, and
  // { success: false } keeps the server id the action wrote on the model from being overwritten.
  assert.ok(out.includes('return { success: false };'));
  assert.ok(!out.includes('r.success'));
});

test('the action result is wrapped, so a non-thenable answer cannot throw a TypeError', () => {
  const { root, utils } = makeDependency(`${SHIPPED}\n`);
  applyPatch(root);
  assert.ok(fs.readFileSync(utils, 'utf8').includes('await Promise.resolve(\n'));
});

test('is idempotent', () => {
  const { root, utils } = makeDependency(`${SHIPPED}\n`);
  applyPatch(root);
  const once = fs.readFileSync(utils, 'utf8');

  assert.deepEqual(applyPatch(root), { skipped: true, reason: 'already applied' });
  assert.equal(fs.readFileSync(utils, 'utf8'), once);
});

test('an unknown shape fails instead of shipping without the fix', () => {
  const { root } = makeDependency('nothing to patch here\n');
  assert.throws(() => applyPatch(root), /unsupported Utils.js shape/);
});

test('isApplied tracks the transform and reads an unreadable tree as applied', () => {
  const { root } = makeDependency(`${SHIPPED}\n`);
  assert.equal(isApplied(root), false);
  applyPatch(root);
  assert.equal(isApplied(root), true);
  assert.equal(isApplied(path.join(root, 'missing')), true);
  assert.ok(PATCHED.includes(LEGACY.split('\n')[1].trim()));
});
