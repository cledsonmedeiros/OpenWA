import { Module } from '@nestjs/common';
import { ChannelController } from './channel.controller';
import { ChannelService } from './channel.service';
import { ChannelPostService } from './channel-post.service';
import { MessageModule } from '../message/message.module';

@Module({
  imports: [MessageModule],
  controllers: [ChannelController],
  providers: [ChannelService, ChannelPostService],
})
export class ChannelModule {}
