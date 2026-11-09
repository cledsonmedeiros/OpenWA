import { useTranslation } from 'react-i18next';
import { sessionApi } from '../../services/api';
import { useMediaBlob } from './useMediaBlob';

/**
 * A channel post's media. whatsapp-web.js flags it but gives no URL, so the bytes come from the message
 * media route by the post's full serialized id. The post carries no media type, so the element is picked
 * from the downloaded blob.
 */
function ChannelMedia({
  sessionId,
  channelId,
  messageId,
}: {
  sessionId: string;
  channelId: string;
  messageId: string;
}) {
  const { t } = useTranslation();
  const { src, type, error } = useMediaBlob(`${sessionId}:${channelId}:${messageId}`, signal =>
    sessionApi.getMessageMediaBlob(sessionId, channelId, messageId, signal),
  );

  if (error) return <span className="status-media-placeholder">{t('chats.status.mediaUnavailable')}</span>;
  if (!src) return null;
  if (type.startsWith('video/')) return <video className="channel-media" src={src} controls />;
  if (type.startsWith('audio/')) return <audio className="channel-media" src={src} controls />;
  return <img className="channel-media" src={src} alt="" />;
}

export default ChannelMedia;
