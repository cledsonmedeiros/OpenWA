/**
 * Live progress of an image batch posted to a channel, emitted once per item and once at the end
 * over the socket (`channel.post.progress`). `postId` is the caller's own correlation id from the
 * request body, so a client can follow its batch among others on the same session.
 */
export interface ChannelPostProgress {
  postId: string;
  channelId: string;
  /** Zero-based position of the item in the batch; `total` on the closing `done` frame. */
  index: number;
  total: number;
  mode: 'album' | 'individual';
  status: 'sent' | 'failed' | 'done';
  messageId?: string;
}
