import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MESSAGE_TEXT_MAX_LENGTH, SendMediaMessageDto } from '../../message/dto/send-message.dto';
import { ToStrictArray, ToStrictBoolean, ToStrictString } from '../../../common/utils/strict-boolean';

export const CHANNEL_POST_IMAGES_MAX = 10;

/** One image of a batch: the same `url` / `base64` + `mimetype` rules (and SSRF guard) as `send-image`. */
export class ChannelImageDto extends PickType(SendMediaMessageDto, ['url', 'base64', 'mimetype'] as const) {}

export class PostChannelImagesDto {
  @ApiProperty({
    description:
      'Caller-generated UUID for this batch. Correlates the `channel.post.progress` socket frames with this ' +
      'request; it is not an idempotency key (send `Idempotency-Key` for that).',
    example: '3f9a1c2e-5b6d-4e7f-8a9b-0c1d2e3f4a5b',
  })
  @ToStrictString()
  @IsUUID()
  postId!: string;

  @ApiProperty({
    type: [ChannelImageDto],
    minItems: 1,
    maxItems: CHANNEL_POST_IMAGES_MAX,
    description: 'Images in the order they are posted. Each one is its own channel post.',
  })
  @ToStrictArray()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CHANNEL_POST_IMAGES_MAX)
  @ValidateNested({ each: true })
  @Type(() => ChannelImageDto)
  images!: ChannelImageDto[];

  @ApiPropertyOptional({
    description: 'Optional text, posted as its own message before or after the images.',
    maxLength: MESSAGE_TEXT_MAX_LENGTH,
  })
  @IsOptional()
  @ToStrictString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MESSAGE_TEXT_MAX_LENGTH)
  text?: string;

  @ApiPropertyOptional({ enum: ['before', 'after'], default: 'after', description: 'Where the text goes.' })
  @IsOptional()
  @IsIn(['before', 'after'])
  textPosition?: 'before' | 'after';

  @ApiPropertyOptional({
    description: 'Link preview for the text post, with the same meaning as `send-text`.',
    example: false,
  })
  @ToStrictBoolean()
  @IsOptional()
  @IsBoolean()
  linkPreview?: boolean;
}
