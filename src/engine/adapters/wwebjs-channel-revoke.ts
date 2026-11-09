/** What {@link revokeChannelPostInPage} reports; `result` is WhatsApp Web's SendMsgResult when not OK. */
export type ChannelRevokeOutcome =
  | { outcome: 'revoked' }
  | { outcome: 'not_found' }
  | { outcome: 'not_allowed' }
  | { outcome: 'failed'; result: string };

/**
 * Page-side revoke ("delete for everyone") of a channel post. whatsapp-web.js `Message#delete` looks the
 * chat up in the regular Chat collection, where a channel is not, and throws on `Chat.find`; WhatsApp Web
 * revokes a channel post through `WAWebNewsletterRevokeMsgAction.sendNewsletterRevokeMsg(chat, msg,
 * clearMedia)` instead, gated by `canRevokeNewsletterMsg`. Runs inside the page via `pupPage.evaluate`, so
 * it must stay self-contained. A bare id is read as the session's own post (`true_<channel>_<id>`), the only
 * kind the owner revokes from the dashboard.
 */
export async function revokeChannelPostInPage(args: {
  channelId: string;
  msgId: string;
}): Promise<ChannelRevokeOutcome> {
  type PageMsg = { id: { remote: unknown } };
  const w = window as unknown as {
    require: (name: string) => Record<string, unknown>;
    WWebJS: { getChat: (id: string, opts: { getAsModel: boolean }) => Promise<unknown> };
  };
  const Msg = w.require('WAWebCollections').Msg as {
    get: (id: string) => PageMsg | undefined;
    getMessagesById: (ids: string[]) => Promise<{ messages?: PageMsg[] }>;
  };
  const msgId = args.msgId.includes('_') ? args.msgId : `true_${args.channelId}_${args.msgId}`;
  const msg = Msg.get(msgId) ?? (await Msg.getMessagesById([msgId]))?.messages?.[0];
  if (!msg || String(msg.id.remote) !== args.channelId) return { outcome: 'not_found' };
  const chat = await w.WWebJS.getChat(args.channelId, { getAsModel: false });
  if (!chat) return { outcome: 'not_found' };
  const capability = w.require('WAWebMsgActionCapability') as { canRevokeNewsletterMsg: (m: PageMsg) => boolean };
  if (!capability.canRevokeNewsletterMsg(msg)) return { outcome: 'not_allowed' };
  const action = w.require('WAWebNewsletterRevokeMsgAction') as {
    sendNewsletterRevokeMsg: (c: unknown, m: PageMsg, clearMedia: boolean) => Promise<{ messageSendResult?: unknown }>;
  };
  const sent = await action.sendNewsletterRevokeMsg(chat, msg, true);
  const result = String(sent?.messageSendResult);
  return result === 'OK' ? { outcome: 'revoked' } : { outcome: 'failed', result };
}
