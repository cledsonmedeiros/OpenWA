import type { Channel } from '../services/api';

/**
 * Whether the channel pane offers the post bar. `role` is a UX signal from the engine (absent on
 * Baileys, `unknown` for any unmapped value): only an owner or admin sees it, and only when the
 * operator may write at all. The server and WhatsApp still decide whether a send is accepted.
 */
export function canPostToChannel(channel: Pick<Channel, 'role'>, canWrite: boolean): boolean {
  return canWrite && (channel.role === 'owner' || channel.role === 'admin');
}

/**
 * `send-text` options for a channel post. Preview on omits the field: whatsapp-web.js builds a
 * preview by default and only an explicit `false` suppresses it.
 */
export function buildChannelTextOptions(previewEnabled: boolean): { linkPreview?: false } {
  return previewEnabled ? {} : { linkPreview: false };
}
