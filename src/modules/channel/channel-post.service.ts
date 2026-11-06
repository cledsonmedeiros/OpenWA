import { BadRequestException, Injectable } from '@nestjs/common';
import { ChannelService } from './channel.service';
import { MessageService } from '../message/message.service';
import { EventsGateway } from '../events/events.gateway';
import { ChannelMediaNotSupportedError } from '../../common/errors/channel-media-not-supported.error';
import { assertBase64WithinMediaCap, stripBase64DataUri } from '../message/media-cap.util';
import type { ChannelImageDto, PostChannelImagesDto } from './dto/post-channel-images.dto';
import type { ChannelPostProgress } from './channel-post.types';
import type { ChannelPostResultDto } from './dto/channel-post-result.dto';

export type ChannelPostResultBody = ChannelPostResultDto;

/** 201: everything went out. 207: something went out and then a send failed; the batch stopped there. */
export interface ChannelPostResult {
  status: 201 | 207;
  body: ChannelPostResultBody;
}

/**
 * Posts an ordered batch of images (and an optional text) to a channel, one send at a time through the
 * regular message pipeline, so pacing, hooks, persistence and the SSRF-guarded media fetch all apply.
 *
 * Never duplicates: nothing is retried or re-sent here. A failure before anything went out propagates the
 * send's own error (and its idempotency semantics); a failure after something went out answers 207 with
 * what was sent and where it stopped, so an `Idempotency-Key` retry replays that answer instead of posting
 * the images again.
 */
@Injectable()
export class ChannelPostService {
  constructor(
    private readonly channels: ChannelService,
    private readonly messages: MessageService,
    private readonly events: EventsGateway,
  ) {}

  async postImages(sessionId: string, channelId: string, dto: PostChannelImagesDto): Promise<ChannelPostResult> {
    const channel = await this.channels.getChannelById(sessionId, channelId);
    if (!channel.mediaSupported) throw new ChannelMediaNotSupportedError();
    dto.images.forEach((image, index) => this.assertSendable(image, index));

    const total = dto.images.length;
    const mode = 'individual' as const;
    const body: ChannelPostResultBody = { mode, sent: [] };
    const progress = (frame: Pick<ChannelPostProgress, 'index' | 'status' | 'messageId'>) =>
      this.events.emitChannelPostProgress(sessionId, { postId: dto.postId, channelId, total, mode, ...frame });
    let anythingSent = false;

    const stop = (error: unknown, failedAt: number): ChannelPostResult => {
      if (!anythingSent) throw error;
      return {
        status: 207,
        body: { ...body, failedAt, error: error instanceof Error ? error.message : String(error) },
      };
    };
    const sendText = async () => {
      const res = await this.messages.sendText(sessionId, {
        chatId: channelId,
        text: dto.text!,
        ...(dto.linkPreview !== undefined ? { linkPreview: dto.linkPreview } : {}),
      });
      body.text = { messageId: res.messageId };
      anythingSent = true;
    };

    if (dto.text && dto.textPosition === 'before') {
      // A failed leading text sends nothing else: there is nothing yet to keep consistent with.
      await sendText();
    }

    for (const [index, image] of dto.images.entries()) {
      try {
        const res = await this.messages.sendImage(sessionId, { chatId: channelId, ...image });
        body.sent.push({ index, messageId: res.messageId });
        anythingSent = true;
        progress({ index, status: 'sent', messageId: res.messageId });
      } catch (error) {
        progress({ index, status: 'failed' });
        return stop(error, index);
      }
    }

    if (dto.text && dto.textPosition !== 'before') {
      try {
        await sendText();
      } catch (error) {
        return stop(error, total);
      }
    }

    progress({ index: total, status: 'done' });
    return { status: 201, body };
  }

  /** The checks a send would fail on, run over the whole batch before the first send. */
  private assertSendable(image: ChannelImageDto, index: number): void {
    const base64 = stripBase64DataUri(image.base64);
    if (!base64 === !image.url) {
      throw new BadRequestException(`images[${index}]: provide exactly one of url or base64`);
    }
    if (base64) {
      if (!image.mimetype?.startsWith('image/')) {
        throw new BadRequestException(`images[${index}]: mimetype must be an image/* type`);
      }
      assertBase64WithinMediaCap(base64);
    }
  }
}
