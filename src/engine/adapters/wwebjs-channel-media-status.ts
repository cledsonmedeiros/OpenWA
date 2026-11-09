import * as fs from 'fs';
import * as path from 'path';

/** The media kinds the whatsapp-web.js send paths can address to a channel. */
export type ChannelMediaKind = 'image' | 'video' | 'audio' | 'document' | 'sticker';

const UTILS_PATH = path.join('src', 'util', 'Injected', 'Utils.js');

/**
 * Whether `scripts/patch-wwebjs-channel-media.js` is applied to the whatsapp-web.js at `depDir`.
 *
 * Fails closed: an unshipped patcher, a library it cannot locate or read, or a throwing predicate all
 * answer false, which keeps the typed 501 (ChannelMediaNotSupportedError). The patcher's own
 * `isApplied` reads an unreadable tree as applied (its convention for the startup report), so the file
 * is checked here first, and the predicate is pointed at the library actually installed rather than at
 * its default `<root>/node_modules`, which a hoisted or relocated install would miss.
 */
export function checkChannelMediaPatch(scriptsDir: string, depDir: string | undefined): boolean {
  if (!depDir || !fs.existsSync(path.join(depDir, UTILS_PATH))) return false;
  try {
    // Requiring a patcher does not run it: each guards its CLI behind `require.main` (engine-patch-status.ts).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const patcher = require(path.join(scriptsDir, 'patch-wwebjs-channel-media.js')) as {
      isApplied?: (dir?: string) => boolean;
    };
    return typeof patcher.isApplied === 'function' && patcher.isApplied(depDir) === true;
  } catch {
    return false;
  }
}

function installedWwebjsDir(): string | undefined {
  try {
    return path.dirname(require.resolve('whatsapp-web.js/package.json'));
  } catch {
    return undefined;
  }
}

let cached: boolean | undefined;

/**
 * Whether an image can be sent to a channel (`<id>@newsletter`) instead of crashing on the removed
 * `msg.avParams()`. Read once per process: the patch is applied at install/image build, never at runtime.
 */
export function isChannelMediaPatchApplied(): boolean {
  // dist/engine/adapters and src/engine/adapters are both three levels below the package root, the same
  // hop engine-patch-status.ts uses; the production image copies scripts/ in.
  cached ??= checkChannelMediaPatch(path.join(__dirname, '..', '..', '..', 'scripts'), installedWwebjsDir());
  return cached;
}
