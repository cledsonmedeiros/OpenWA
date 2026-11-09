import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { checkChannelMediaPatch } from './wwebjs-channel-media-status';

const PATCHER = path.join(__dirname, '..', '..', '..', 'scripts', 'patch-wwebjs-channel-media.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { LEGACY, PATCHED } = require(PATCHER) as { LEGACY: string; PATCHED: string };

function depWithUtils(source: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openwa-media-status-'));
  const utils = path.join(dir, 'src', 'util', 'Injected', 'Utils.js');
  fs.mkdirSync(path.dirname(utils), { recursive: true });
  fs.writeFileSync(utils, source);
  return dir;
}

describe('checkChannelMediaPatch', () => {
  const scriptsDir = path.dirname(PATCHER);

  it('is true for the installed library carrying the patch', () => {
    expect(checkChannelMediaPatch(scriptsDir, depWithUtils(`x\n${PATCHED}\ny`))).toBe(true);
  });

  it('is false for the installed library without it', () => {
    expect(checkChannelMediaPatch(scriptsDir, depWithUtils(`x\n${LEGACY}\ny`))).toBe(false);
  });

  it('fails closed when the library cannot be located or read, where the patcher itself would say applied', () => {
    expect(checkChannelMediaPatch(scriptsDir, undefined)).toBe(false);
    expect(checkChannelMediaPatch(scriptsDir, path.join(os.tmpdir(), 'openwa-no-such-wwjs'))).toBe(false);
  });

  it('is false when the patcher is not shipped', () => {
    expect(checkChannelMediaPatch(path.join(os.tmpdir(), 'openwa-no-scripts'), depWithUtils(PATCHED))).toBe(false);
  });
});
