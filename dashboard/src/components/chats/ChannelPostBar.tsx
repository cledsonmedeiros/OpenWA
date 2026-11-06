import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { messageApi, sessionApi, type ChannelPostProgress } from '../../services/api';
import { useRole } from '../../hooks/useRole';
import { useToast } from '../../hooks/useToast';
import { buildChannelTextOptions } from '../../utils/channelPosting';
import { compressImage, fitsBatch } from '../../utils/compressImage';
import { newUuid } from '../../utils/uuid';
import ComposerInputBar from './ComposerInputBar';
import ChannelImageTray, { type TrayImage } from './ChannelImageTray';

/** A channel post carries at most this many images (the gateway's own cap). */
const MAX_IMAGES = 10;

interface ChannelPostBarProps {
  sessionId: string;
  channelId: string;
  /** The channel reports images can be sent (whatsapp-web.js with the channel media patch). */
  mediaSupported?: boolean;
  /** The latest `channel.post.progress` frame on this session; frames of other batches are ignored. */
  progress?: ChannelPostProgress | null;
}

interface PickedImage extends TrayImage {
  file: File;
}

// Post bar for a channel the session owns or administers (the pane decides via canPostToChannel).
// Text on its own goes through send-text. With images it posts a batch: up to 10, compressed in the
// browser, in the tray's order, with the text before or after them; progress comes from the socket and
// the final answer from HTTP, so a dropped socket only loses the live counter. No optimistic bubble —
// channel posts carry no fromMe, so the feed shows the posts after a refetch. A failed send keeps what
// the operator prepared and refetches the channel list, since a stale role is the likeliest cause.
function ChannelPostBar({ sessionId, channelId, mediaSupported = false, progress = null }: ChannelPostBarProps) {
  const { t } = useTranslation();
  const { canWrite } = useRole();
  const { error: showErrorToast, warning: showWarningToast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState('');
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [textPosition, setTextPosition] = useState<'before' | 'after'>('after');
  const [images, setImages] = useState<PickedImage[]>([]);
  const [sending, setSending] = useState(false);
  const [activePostId, setActivePostId] = useState<string | null>(null);

  // Object URLs are released with the image that owns them, and all of them on unmount.
  const imagesRef = useRef(images);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  useEffect(() => () => imagesRef.current.forEach(i => URL.revokeObjectURL(i.previewUrl)), []);

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])].filter(f => f.type.startsWith('image/'));
    event.target.value = '';
    const room = MAX_IMAGES - images.length;
    if (files.length > room) showWarningToast(t('chats.channels.tooManyImages'));
    const added = files.slice(0, Math.max(0, room)).map(file => ({
      id: newUuid(),
      name: file.name,
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    if (added.length) setImages(prev => [...prev, ...added]);
  };

  const move = (from: number, to: number) =>
    setImages(prev => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });

  const remove = (index: number) =>
    setImages(prev => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });

  const dropSent = (count: number) =>
    setImages(prev => {
      prev.slice(0, count).forEach(i => URL.revokeObjectURL(i.previewUrl));
      return prev.slice(count);
    });

  const refetchAfterFailure = () => void queryClient.invalidateQueries({ queryKey: ['channels', sessionId] });
  const refetchFeed = () =>
    void queryClient.invalidateQueries({ queryKey: ['channel-messages', sessionId, channelId] });

  const sendBatch = async (toSend: string) => {
    const batch = images;
    const compressed = await Promise.all(batch.map(i => compressImage(i.file)));
    if (!fitsBatch(compressed)) {
      showWarningToast(t('chats.channels.batchTooLarge'));
      return;
    }
    const postId = newUuid();
    setActivePostId(postId);
    const result = await sessionApi.postChannelImages(sessionId, channelId, {
      postId,
      images: compressed.map(c => ({ base64: c.base64, mimetype: c.mimetype })),
      ...(toSend ? { text: toSend, textPosition, ...buildChannelTextOptions(previewEnabled) } : {}),
    });
    refetchFeed();
    if (result.failedAt !== undefined) {
      // Only the images that went out leave the tray; the text stays if it did not go out.
      dropSent(result.sent.length);
      if (result.text) setText('');
      showWarningToast(
        t('chats.channels.partialSent', { sent: result.sent.length, total: batch.length }),
        result.error,
      );
      refetchAfterFailure();
      return;
    }
    dropSent(batch.length);
    setText('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const toSend = text.trim();
    if (sending || (!toSend && images.length === 0) || !canWrite) return;
    setSending(true);
    try {
      if (images.length > 0) {
        await sendBatch(toSend);
      } else {
        await messageApi.sendText(sessionId, channelId, toSend, buildChannelTextOptions(previewEnabled));
        setText('');
        refetchFeed();
      }
    } catch (err) {
      showErrorToast(t('chats.errors.send'), err instanceof Error ? err.message : undefined);
      refetchAfterFailure();
    } finally {
      setSending(false);
      setActivePostId(null);
    }
  };

  const liveProgress = sending && progress && progress.postId === activePostId ? progress : null;
  const attachTitle = mediaSupported ? t('chats.channels.attachImages') : t('chats.channels.attachUnsupported');

  return (
    <footer className="room-input-footer">
      <ChannelImageTray items={images} disabled={sending} onMove={move} onRemove={remove} />
      {images.length > 0 && (
        <div className="composer-banner channel-batch-options">
          <select
            aria-label={t('chats.channels.textPosition')}
            value={textPosition}
            onChange={e => setTextPosition(e.target.value as 'before' | 'after')}
            disabled={sending}
          >
            <option value="after">{t('chats.channels.textAfter')}</option>
            <option value="before">{t('chats.channels.textBefore')}</option>
          </select>
          {liveProgress && liveProgress.status !== 'done' && (
            <span className="channel-batch-progress" role="status">
              {t('chats.channels.sending', { current: liveProgress.index + 1, total: liveProgress.total })}
            </span>
          )}
        </div>
      )}
      <ComposerInputBar
        value={text}
        onChange={setText}
        onSubmit={e => void handleSubmit(e)}
        placeholder={canWrite ? t('chats.channels.postPlaceholder') : t('chats.noPermission')}
        canWrite={canWrite}
        sending={sending}
        canSubmit={Boolean(text.trim()) || images.length > 0}
        attach={{
          onClick: () => fileInputRef.current?.click(),
          disabled: !mediaSupported || !canWrite || sending || images.length >= MAX_IMAGES,
          title: attachTitle,
        }}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFiles}
          accept="image/*"
          multiple
          style={{ display: 'none' }}
        />
        <label className="channel-link-preview-toggle">
          <input
            type="checkbox"
            checked={previewEnabled}
            onChange={e => setPreviewEnabled(e.target.checked)}
            disabled={!canWrite || sending}
          />
          {t('chats.channels.linkPreview')}
        </label>
      </ComposerInputBar>
    </footer>
  );
}

export default ChannelPostBar;
