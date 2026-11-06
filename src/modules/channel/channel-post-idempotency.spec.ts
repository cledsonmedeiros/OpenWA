import { ExecutionContext } from '@nestjs/common';
import { from, lastValueFrom } from 'rxjs';
import { SendIdempotencyInterceptor } from '../message/idempotency/send-idempotency.interceptor';
import type { SendIdempotencyService } from '../message/idempotency/send-idempotency.service';
import { ChannelController } from './channel.controller';
import type { ChannelService } from './channel.service';

/**
 * The anti-duplication promise of the channel image batch, end to end through the real interceptor: a
 * batch that stopped midway answers 207, that answer is stored under the Idempotency-Key, and a retry
 * with the same key replays it without the batch running again — no image is posted twice.
 */
describe('channel image batch + Idempotency-Key', () => {
  // The store's contract reduced to memory: the first claim runs, a completed key replays.
  const memoryStore = () => {
    const rows = new Map<string, { done: boolean; body?: unknown }>();
    return {
      claim: jest.fn(({ sessionId, key }: { sessionId: string; key: string }) => {
        const id = `${sessionId}:${key}`;
        const row = rows.get(id);
        if (row?.done) return Promise.resolve({ kind: 'replay' as const, body: row.body });
        rows.set(id, { done: false });
        return Promise.resolve({ kind: 'claimed' as const, id });
      }),
      complete: jest.fn((id: string, body: unknown) => {
        rows.set(id, { done: true, body });
        return Promise.resolve();
      }),
      release: jest.fn(() => Promise.resolve()),
      markFailed: jest.fn(() => Promise.resolve()),
    };
  };

  it('replays a 207 partial batch to a retry with the same key; the batch runs once', async () => {
    const partial = { mode: 'individual', sent: [{ index: 0, messageId: 'm0' }], failedAt: 1, error: 'boom' };
    const posts = { postImages: jest.fn().mockResolvedValue({ status: 207, body: partial }) };
    const controller = new ChannelController({} as unknown as ChannelService, posts as never);
    const store = memoryStore();
    const interceptor = new SendIdempotencyInterceptor(store as unknown as SendIdempotencyService);
    const body = {
      postId: '3f9a1c2e-0000-4000-8000-000000000001',
      images: [{ base64: 'AQID', mimetype: 'image/jpeg' }],
    };

    const call = async () => {
      const res = { status: jest.fn(), setHeader: jest.fn() };
      const context = {
        getType: () => 'http',
        // Only the handler's name is read (the idempotency route key).
        getHandler: () => ({ name: 'postImages' }),
        switchToHttp: () => ({
          getRequest: () => ({ headers: { 'idempotency-key': 'k-1' }, params: { sessionId: 's1' }, body }),
          getResponse: () => res,
        }),
      } as unknown as ExecutionContext;
      const handler = { handle: () => from(controller.postImages('s1', 'c@newsletter', body as never, res as never)) };
      const out: unknown = await lastValueFrom(await interceptor.intercept(context, handler));
      return { out, res };
    };

    const first = await call();
    const retry = await call();

    expect(first.out).toEqual(partial);
    expect(first.res.status).toHaveBeenCalledWith(207);
    expect(retry.out).toEqual(partial);
    expect(retry.res.setHeader).toHaveBeenCalledWith('idempotent-replayed', 'true');
    expect(posts.postImages).toHaveBeenCalledTimes(1);
  });
});
