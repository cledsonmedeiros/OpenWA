import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChannelPostSentItemDto {
  @ApiProperty({ description: 'Position of the image in the request.', example: 0 })
  index!: number;

  @ApiProperty({ description: 'Message id of the post.', example: 'true_120363@newsletter_3EB0A1' })
  messageId!: string;
}

export class ChannelPostTextDto {
  @ApiProperty({ description: 'Message id of the text post.', example: 'true_120363@newsletter_3EB0B2' })
  messageId!: string;
}

export class ChannelPostResultDto {
  @ApiProperty({
    enum: ['album', 'individual'],
    description: 'How the images went out. Always `individual` today: a channel album is not sendable yet.',
    example: 'individual',
  })
  mode!: 'album' | 'individual';

  @ApiProperty({ type: [ChannelPostSentItemDto], description: 'The images that went out, in order.' })
  sent!: ChannelPostSentItemDto[];

  @ApiPropertyOptional({ type: ChannelPostTextDto, description: 'The text post, when one was sent.' })
  text?: ChannelPostTextDto;

  @ApiPropertyOptional({
    description: 'On 207: index of the image that failed, or the image count when only the trailing text failed.',
    example: 2,
  })
  failedAt?: number;

  @ApiPropertyOptional({ description: 'On 207: why the batch stopped.' })
  error?: string;
}
