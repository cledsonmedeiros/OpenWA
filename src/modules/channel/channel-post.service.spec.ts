import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { loadRemoteMediaBuffer } from '../../common/media/load-remote-media';

// The SSRF-guarded fetch is the network edge; each test says what a URL answers.
jest.mock('../../common/media/load-remote-media', () => ({ loadRemoteMediaBuffer: jest.fn() }));
import { ChannelPostService } from './channel-post.service';
import { ChannelMediaNotSupportedError } from '../../common/errors/channel-media-not-supported.error';
import type { PostChannelImagesDto } from './dto/post-channel-images.dto';
import type { ChannelPostProgress } from './channel-post.types';

const CHANNEL = '120363@newsletter';
const POST_ID = '3f9a1c2e-0000-4000-8000-000000000001';

function setup(opts: { mediaSupported?: boolean; failImageAt?: number; failText?: boolean } = {}) {
  const calls: string[] = [];
  let imageCount = 0;
  const channels = {
    getChannelById: jest
      .fn()
      .mockResolvedValue({ id: CHANNEL, name: 'C', mediaSupported: opts.mediaSupported ?? true }),
  };
  const messages = {
    sendText: jest.fn((_s: string, dto: { text: string; linkPreview?: boolean }) => {
      calls.push(`text:${dto.text}`);
      if (opts.failText) return Promise.reject(new InternalServerErrorException('text failed'));
      return Promise.resolve({ messageId: `t-${calls.length}` });
    }),
    sendImage: jest.fn((_s: string, dto: { base64?: string }) => {
      const i = imageCount++;
      if (opts.failImageAt === i) return Promise.reject(new InternalServerErrorException(`image ${i} failed`));
      calls.push(`image:${dto.base64}`);
      return Promise.resolve({ messageId: `i-${i}` });
    }),
  };
  const events = { emitChannelPostProgress: jest.fn<void, [string, ChannelPostProgress]>() };
  const engines = { proxyUrl: jest.fn().mockReturnValue('socks5://proxy:1080') };
  const service = new ChannelPostService(channels as never, messages as never, events as never, engines as never);
  return { service, calls, messages, events, channels };
}

const dto = (n: number, extra: Partial<PostChannelImagesDto> = {}): PostChannelImagesDto =>
  ({
    postId: POST_ID,
    images: Array.from({ length: n }, (_, i) => ({ base64: `b${i}`, mimetype: 'image/jpeg' })),
    ...extra,
  }) satisfies Partial<PostChannelImagesDto>;

describe('ChannelPostService.postImages', () => {
  it('sends the images one by one in the given order, then nothing else', async () => {
    const { service, calls } = setup();
    const res = await service.postImages('s1', CHANNEL, dto(3));
    expect(calls).toEqual(['image:b0', 'image:b1', 'image:b2']);
    expect(res).toEqual({
      status: 201,
      body: { mode: 'individual', sent: [0, 1, 2].map(i => ({ index: i, messageId: `i-${i}` })) },
    });
  });

  it('textPosition after (the default) sends the text last', async () => {
    const { service, calls } = setup();
    const res = await service.postImages('s1', CHANNEL, dto(2, { text: 'oi' }));
    expect(calls).toEqual(['image:b0', 'image:b1', 'text:oi']);
    expect(res.body.text).toEqual({ messageId: 't-3' });
  });

  it('textPosition before sends the text first', async () => {
    const { service, calls } = setup();
    await service.postImages('s1', CHANNEL, dto(2, { text: 'oi', textPosition: 'before' }));
    expect(calls).toEqual(['text:oi', 'image:b0', 'image:b1']);
  });

  it('passes linkPreview through to the text post', async () => {
    const { service, messages } = setup();
    await service.postImages('s1', CHANNEL, dto(1, { text: 'x https://a.b', linkPreview: false }));
    expect(messages.sendText).toHaveBeenCalledWith('s1', {
      chatId: CHANNEL,
      text: 'x https://a.b',
      linkPreview: false,
    });
  });

  it('a channel without mediaSupported answers 501 before sending anything, the text included', async () => {
    const { service, messages } = setup({ mediaSupported: false });
    await expect(
      service.postImages('s1', CHANNEL, dto(2, { text: 'oi', textPosition: 'before' })),
    ).rejects.toBeInstanceOf(ChannelMediaNotSupportedError);
    expect(messages.sendText).not.toHaveBeenCalled();
    expect(messages.sendImage).not.toHaveBeenCalled();
  });

  it('a failure on the first send propagates the original error: nothing went out', async () => {
    const { service } = setup({ failImageAt: 0 });
    await expect(service.postImages('s1', CHANNEL, dto(3))).rejects.toThrow('image 0 failed');
  });

  it('a failure on item k stops the batch with 207, k items sent and failedAt k, no trailing text', async () => {
    const { service, calls, messages } = setup({ failImageAt: 2 });
    const res = await service.postImages('s1', CHANNEL, dto(4, { text: 'fim' }));
    expect(res.status).toBe(207);
    expect(res.body.sent).toHaveLength(2);
    expect(res.body.failedAt).toBe(2);
    expect(res.body.error).toBe('image 2 failed');
    expect(calls).toEqual(['image:b0', 'image:b1']);
    expect(messages.sendText).not.toHaveBeenCalled();
  });

  it('a 207 never echoes the raw text of an error that is not an HTTP exception', async () => {
    const { service, messages } = setup();
    messages.sendImage
      .mockImplementationOnce(() => Promise.resolve({ messageId: 'i-0' }))
      .mockImplementationOnce(() => Promise.reject(new Error('page threw {"build":"2.3000","stack":"secret"}')));
    const res = await service.postImages('s1', CHANNEL, dto(2));
    expect(res.status).toBe(207);
    expect(res.body.error).toBe('The send failed.');
  });

  it('a leading text that went out turns a first-image failure into a 207', async () => {
    const { service } = setup({ failImageAt: 0 });
    const res = await service.postImages('s1', CHANNEL, dto(2, { text: 'oi', textPosition: 'before' }));
    expect(res.status).toBe(207);
    expect(res.body.text).toEqual({ messageId: 't-1' });
    expect(res.body.failedAt).toBe(0);
  });

  it('a failing trailing text after every image is a 207 with failedAt = images.length', async () => {
    const { service } = setup({ failText: true });
    const res = await service.postImages('s1', CHANNEL, dto(2, { text: 'oi' }));
    expect(res.status).toBe(207);
    expect(res.body.sent).toHaveLength(2);
    expect(res.body.failedAt).toBe(2);
  });

  it('an invalid image anywhere in the batch is a 400 before the first send', async () => {
    const { service, messages } = setup();
    const batch = dto(4, { text: 'oi', textPosition: 'before' });
    batch.images[3] = { base64: 'b3', mimetype: 'application/pdf' };
    await expect(service.postImages('s1', CHANNEL, batch)).rejects.toThrow(
      'images[3]: mimetype must be an image/* type',
    );
    expect(messages.sendText).not.toHaveBeenCalled();
    expect(messages.sendImage).not.toHaveBeenCalled();
  });

  it('an image with neither url nor base64, or with both, is a 400 before the first send', async () => {
    const { service, messages } = setup();
    const neither = dto(2);
    neither.images[1] = { mimetype: 'image/jpeg' };
    await expect(service.postImages('s1', CHANNEL, neither)).rejects.toThrow(
      'images[1]: provide exactly one of url or base64',
    );
    const both = dto(2);
    both.images[0] = { url: 'https://x.y/a.jpg', base64: 'b0', mimetype: 'image/jpeg' };
    await expect(service.postImages('s1', CHANNEL, both)).rejects.toThrow(
      'images[0]: provide exactly one of url or base64',
    );
    expect(messages.sendImage).not.toHaveBeenCalled();
  });

  it('fetches URL images through the guarded loader before the first send and posts them as base64', async () => {
    jest.mocked(loadRemoteMediaBuffer).mockResolvedValueOnce({ data: Buffer.from([1, 2, 3]), mimetype: 'image/png' });
    const { service, messages } = setup();
    const batch = dto(2);
    batch.images[1] = { url: 'https://cdn.example/b.png' };
    await service.postImages('s1', CHANNEL, batch);
    expect(loadRemoteMediaBuffer).toHaveBeenCalledWith('https://cdn.example/b.png', 'socks5://proxy:1080');
    expect(messages.sendImage).toHaveBeenNthCalledWith(2, 's1', {
      chatId: CHANNEL,
      base64: 'AQID',
      mimetype: 'image/png',
    });
  });

  it('a URL the guarded loader refuses (SSRF, 404, too large) is a 400 before anything is sent', async () => {
    jest.mocked(loadRemoteMediaBuffer).mockRejectedValueOnce(new BadRequestException('blocked address'));
    const { service, messages } = setup();
    const batch = dto(3, { text: 'oi', textPosition: 'before' });
    batch.images[2] = { url: 'http://169.254.169.254/x' };
    await expect(service.postImages('s1', CHANNEL, batch)).rejects.toThrow('blocked address');
    expect(messages.sendText).not.toHaveBeenCalled();
    expect(messages.sendImage).not.toHaveBeenCalled();
  });

  it('a URL that answers something other than an image is a 400 before anything is sent', async () => {
    jest.mocked(loadRemoteMediaBuffer).mockResolvedValueOnce({ data: Buffer.from([1]), mimetype: 'video/mp4' });
    const { service, messages } = setup();
    const batch = dto(2);
    batch.images[1] = { url: 'https://cdn.example/clip' };
    await expect(service.postImages('s1', CHANNEL, batch)).rejects.toThrow(
      'images[1]: the URL did not answer an image',
    );
    expect(messages.sendImage).not.toHaveBeenCalled();
  });

  it('corrupt base64 is a 400 before anything is sent', async () => {
    const { service, messages } = setup();
    const batch = dto(2);
    batch.images[1] = { base64: 'not base64!!', mimetype: 'image/jpeg' };
    await expect(service.postImages('s1', CHANNEL, batch)).rejects.toThrow('images[1]: base64 is not valid');
    expect(messages.sendImage).not.toHaveBeenCalled();
  });

  it('emits progress per image and a closing done frame', async () => {
    const { service, events } = setup();
    await service.postImages('s1', CHANNEL, dto(2));
    const frames = events.emitChannelPostProgress.mock.calls.map(([, f]) => [f.index, f.status, f.total]);
    expect(frames).toEqual([
      [0, 'sent', 2],
      [1, 'sent', 2],
      [2, 'done', 2],
    ]);
    expect(events.emitChannelPostProgress.mock.calls[0][1]).toMatchObject({
      postId: POST_ID,
      channelId: CHANNEL,
      mode: 'individual',
      messageId: 'i-0',
    });
  });

  it('emits a failed frame for the item that failed', async () => {
    const { service, events } = setup({ failImageAt: 1 });
    await service.postImages('s1', CHANNEL, dto(3));
    const last = events.emitChannelPostProgress.mock.calls.at(-1)?.[1];
    expect(last).toMatchObject({ index: 1, status: 'failed', total: 3 });
  });
});
