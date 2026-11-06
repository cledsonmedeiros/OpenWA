/**
 * Route whatsapp-web.js channel MEDIA sends through WA Web's own newsletter media action.
 *
 * whatsapp-web.js 1.34.7 builds the newsletter send by hand and reads `msg.avParams()` for the media
 * metadata; WA Web removed that method (upstream wwebjs#201823), so every media send to a channel threw
 * `TypeError: msg.avParams is not a function`. WA Web itself sends channel media through
 * `WAWebNewsletterSendMsgAction.sendNewsletterMediaMsg(chat, msg, beforeSend)` (WAWebMediaPrepSendToChat,
 * WAWebMediaResumeUploadMsg). whatsapp-web.js has already uploaded the media at this point, so
 * `beforeSend` hands the message back unchanged. Verified live on WA Web 2.3000.1053430300: an image
 * with a caption reached a channel with a server id and rendered on the phone.
 *
 * Only the media branch changes; text and polls keep `sendNewsletterMessageJob`. The action answers a
 * result whose shape is not documented, so anything without `success` and an `ack` reads as
 * `{ success: false }` — the code that follows then skips its `ack.t` read instead of throwing.
 *
 * Exact-shape and self-disabling, like the other patchers: an unknown shape fails the production
 * image build instead of silently shipping without the fix.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { writeFileAtomic } = require('./atomic-write');

const DEFAULT_WWJS = path.join(__dirname, '..', 'node_modules', 'whatsapp-web.js');
const UTILS_PATH = path.join('src', 'util', 'Injected', 'Utils.js');

const LEGACY = `            const sendChannelMsgResponse = await window
                .require('WAWebNewsletterSendMessageJob')
                .sendNewsletterMessageJob({`;

const PATCHED = `            const sendChannelMsgResponse = isMedia
                ? await window
                      .require('WAWebNewsletterSendMsgAction')
                      .sendNewsletterMediaMsg(chat, msg, () => Promise.resolve(msg))
                      .then(r => (r && r.success && r.ack ? r : { success: false }))
                : await window
                .require('WAWebNewsletterSendMessageJob')
                .sendNewsletterMessageJob({`;

const count = (source, needle) => source.split(needle).length - 1;

function applyPatch(wwjsDir = DEFAULT_WWJS) {
  const file = path.join(wwjsDir, UTILS_PATH);
  if (!fs.existsSync(file)) throw new Error(`whatsapp-web.js Utils.js not found at ${file}`);
  const source = fs.readFileSync(file, 'utf8');
  if (count(source, PATCHED) === 1) return { skipped: true, reason: 'already applied' };
  if (count(source, LEGACY) !== 1) {
    throw new Error(
      `unsupported Utils.js shape (legacy blocks: ${count(source, LEGACY)}); ` +
        're-evaluate the channel media patch against the installed whatsapp-web.js',
    );
  }
  writeFileAtomic(file, source.replace(LEGACY, PATCHED));
  return { skipped: false, note: 'channel media routed through sendNewsletterMediaMsg' };
}

/**
 * The stand-down branch above as a predicate, for the startup guard (engine-patch-status.ts) and the
 * adapter, which only lets images through to a channel when this is true. Unreadable reads as
 * applied, the convention every patcher's isApplied follows.
 */
function isApplied(wwjsDir = DEFAULT_WWJS) {
  try {
    return count(fs.readFileSync(path.join(wwjsDir, UTILS_PATH), 'utf8'), PATCHED) === 1;
  } catch {
    return true;
  }
}

function run() {
  const bestEffort = process.argv.includes('--best-effort');
  try {
    const result = applyPatch();
    console.log(`patch-wwebjs-channel-media: ${result.skipped ? `skipped — ${result.reason}` : result.note}`);
  } catch (error) {
    if (bestEffort) {
      console.warn(`patch-wwebjs-channel-media: skipped — ${error.message}`);
      return;
    }
    console.error(`patch-wwebjs-channel-media: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) run();

module.exports = { applyPatch, isApplied, LEGACY, PATCHED };
