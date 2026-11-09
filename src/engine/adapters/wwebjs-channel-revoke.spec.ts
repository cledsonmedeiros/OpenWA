import type { Client } from 'whatsapp-web.js';
import { revokeChannelPostInPage } from './wwebjs-channel-revoke';
import { WwebjsMessaging } from './wwebjs-messaging';
import { createLogger } from '../../common/services/logger.service';
import { type WwebjsEngineHost } from './wwebjs-host';
import { MessageNotFoundError } from '../../common/errors/message-not-found.error';
import { EngineRefusedError } from '../../common/errors/engine-refused.error';
import { EngineTransportError } from '../../common/errors/engine-transport.error';

/**
 * whatsapp-web.js `Message#delete` looks the chat up in the regular Chat collection, where a channel is
 * not, and fails on `Chat.find` (`this.findImpl is not a function`), so deleting a channel post answered
 * 500 and left the post up. WhatsApp Web revokes a channel post through its own newsletter action, which
 * these run against a stand-in `window`.
 */
const CHANNEL = '120363435761353227@newsletter';
const POST = `true_${CHANNEL}_3EB0AA`;
const g = globalThis as unknown as { window?: unknown };

function pageWith(opts: { msg?: object | null; chat?: object | null; canRevoke?: boolean; result?: string }) {
  const msg = opts.msg === undefined ? { id: { remote: CHANNEL } } : opts.msg;
  const chat = opts.chat === undefined ? { id: CHANNEL } : opts.chat;
  const revoke = jest.fn().mockResolvedValue({ messageSendResult: opts.result ?? 'OK' });
  const lookedUp: string[] = [];
  g.window = {
    require: (name: string) => {
      if (name === 'WAWebCollections')
        return {
          Msg: {
            get: (id: string) => {
              lookedUp.push(id);
              return id === POST ? msg : undefined;
            },
            getMessagesById: () => Promise.resolve({ messages: [] }),
          },
        };
      if (name === 'WAWebMsgActionCapability') return { canRevokeNewsletterMsg: () => opts.canRevoke ?? true };
      if (name === 'WAWebNewsletterRevokeMsgAction') return { sendNewsletterRevokeMsg: revoke };
      throw new Error(`unexpected module ${name}`);
    },
    WWebJS: { getChat: jest.fn().mockResolvedValue(chat) },
  };
  return { revoke, lookedUp, msg, chat };
}

afterEach(() => delete g.window);

describe('revokeChannelPostInPage', () => {
  it('revokes the post through the newsletter action, clearing its media', async () => {
    const { revoke, msg, chat } = pageWith({});
    await expect(revokeChannelPostInPage({ channelId: CHANNEL, msgId: POST })).resolves.toEqual({ outcome: 'revoked' });
    expect(revoke).toHaveBeenCalledWith(chat, msg, true);
  });

  it('accepts the bare message id, as the delete route does for chats', async () => {
    const { revoke, lookedUp } = pageWith({});
    await expect(revokeChannelPostInPage({ channelId: CHANNEL, msgId: '3EB0AA' })).resolves.toEqual({
      outcome: 'revoked',
    });
    expect(lookedUp).toContain(POST);
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it('is not_found for a post the page does not hold, or one of another channel', async () => {
    pageWith({ msg: null });
    await expect(revokeChannelPostInPage({ channelId: CHANNEL, msgId: POST })).resolves.toEqual({
      outcome: 'not_found',
    });
    pageWith({ msg: { id: { remote: 'other@newsletter' } } });
    await expect(revokeChannelPostInPage({ channelId: CHANNEL, msgId: POST })).resolves.toEqual({
      outcome: 'not_found',
    });
  });

  it('is not_allowed, sending nothing, when WhatsApp Web says the post cannot be revoked', async () => {
    const { revoke } = pageWith({ canRevoke: false });
    await expect(revokeChannelPostInPage({ channelId: CHANNEL, msgId: POST })).resolves.toEqual({
      outcome: 'not_allowed',
    });
    expect(revoke).not.toHaveBeenCalled();
  });

  it('is failed with the result WhatsApp gave when the revoke is not OK', async () => {
    pageWith({ result: 'ERROR_NETWORK' });
    await expect(revokeChannelPostInPage({ channelId: CHANNEL, msgId: POST })).resolves.toEqual({
      outcome: 'failed',
      result: 'ERROR_NETWORK',
    });
  });
});

describe('WwebjsMessaging.deleteMessage on a channel', () => {
  function messaging(outcome: object) {
    const evaluate = jest.fn().mockResolvedValue(outcome);
    const client = { pupPage: { evaluate }, getChatById: jest.fn() };
    const host = {
      ensureReady: jest.fn(),
      getClient: () => client as unknown as Client,
      isPageTransportError: () => false,
      reportIfPageTransportError: jest.fn(),
      logger: createLogger('wwebjs-channel-revoke.spec'),
    } as unknown as WwebjsEngineHost;
    return { m: new WwebjsMessaging(host), evaluate, client };
  }

  it('revokes through the page action instead of Message#delete', async () => {
    const { m, evaluate, client } = messaging({ outcome: 'revoked' });
    await expect(m.deleteMessage(CHANNEL, POST)).resolves.toBeUndefined();
    expect(evaluate).toHaveBeenCalledWith(revokeChannelPostInPage, { channelId: CHANNEL, msgId: POST });
    expect(client.getChatById).not.toHaveBeenCalled();
  });

  it('maps not_found to 404, not_allowed to 403 and failed to 503', async () => {
    await expect(messaging({ outcome: 'not_found' }).m.deleteMessage(CHANNEL, POST)).rejects.toBeInstanceOf(
      MessageNotFoundError,
    );
    await expect(messaging({ outcome: 'not_allowed' }).m.deleteMessage(CHANNEL, POST)).rejects.toBeInstanceOf(
      EngineRefusedError,
    );
    await expect(
      messaging({ outcome: 'failed', result: 'ERROR_NETWORK' }).m.deleteMessage(CHANNEL, POST),
    ).rejects.toBeInstanceOf(EngineTransportError);
  });
});
