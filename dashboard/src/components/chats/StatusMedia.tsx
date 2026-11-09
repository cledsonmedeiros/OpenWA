import { useTranslation } from 'react-i18next';
import { sessionApi } from '../../services/api';
import { useMediaBlob } from './useMediaBlob';

// Status image item. Every item of the open contact mounts at once, so the fetches take their turns a
// gap apart and a refusal for rate is retried, as the previews of archived chat media do (useMediaBlob).
function StatusMedia({
  sessionId,
  statusId,
  type,
}: {
  sessionId: string | null;
  statusId: string;
  type: 'image' | 'video' | 'audio';
}) {
  const { t } = useTranslation();
  const { src, error } = useMediaBlob(sessionId ? `${sessionId}:${statusId}` : null, signal =>
    sessionApi.getStatusMediaBlob(sessionId ?? '', statusId, signal),
  );

  if (error) return <span className="status-media-placeholder">{t('chats.status.mediaUnavailable')}</span>;
  if (!src) return null;
  if (type === 'video') return <video className="channel-media" src={src} controls />;
  // Voice statuses: the blob is an Ogg/Opus voice note — an <img> would render as a broken image.
  if (type === 'audio') return <audio className="channel-media" src={src} controls />;
  return <img className="channel-media" src={src} alt="" />;
}

export default StatusMedia;
