import * as path from 'path';

/** The media kinds the whatsapp-web.js send paths can address to a channel. */
export type ChannelMediaKind = 'image' | 'video' | 'audio' | 'document' | 'sticker';

/**
 * Whether `scripts/patch-wwebjs-channel-media.js` is applied to the installed whatsapp-web.js, i.e.
 * whether an image can be sent to a channel (`<id>@newsletter`) instead of crashing on the removed
 * `msg.avParams()`. Read once per process: the patch is applied at install/image build, never at
 * runtime.
 *
 * Fails closed: a missing patcher or a throwing predicate answers false, which keeps the typed 501
 * (ChannelMediaNotSupportedError). The patcher's own `isApplied` reads an unreadable tree as applied;
 * that is its convention for the startup report, and the send itself would still surface any crash.
 */
let cached: boolean | undefined;

export function isChannelMediaPatchApplied(): boolean {
  if (cached !== undefined) return cached;
  try {
    // dist/engine/adapters and src/engine/adapters are both three levels below the package root,
    // the same hop engine-patch-status.ts uses; the production image copies scripts/ in.
    // Requiring a patcher does not run it: each guards its CLI behind `require.main` (engine-patch-status.ts).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const patcher = require(path.join(__dirname, '..', '..', '..', 'scripts', 'patch-wwebjs-channel-media.js')) as {
      isApplied?: () => boolean;
    };
    cached = typeof patcher.isApplied === 'function' && patcher.isApplied() === true;
  } catch {
    cached = false;
  }
  return cached;
}
