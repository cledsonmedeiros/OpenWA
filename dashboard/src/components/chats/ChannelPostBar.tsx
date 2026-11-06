import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { messageApi } from '../../services/api';
import { useRole } from '../../hooks/useRole';
import { useToast } from '../../hooks/useToast';
import { buildChannelTextOptions } from '../../utils/channelPosting';
import ComposerInputBar from './ComposerInputBar';

interface ChannelPostBarProps {
  sessionId: string;
  channelId: string;
}

// Post bar for a channel the session owns or administers (the pane decides via canPostToChannel).
// Text only: whatsapp-web.js cannot send media to a channel (501), so the attach button stays
// visible but disabled with the reason as its tooltip. No optimistic bubble — channel posts carry no
// fromMe, so the feed shows the post after a refetch. A failed send keeps the text and refetches the
// channel list, since a stale role is the likeliest reason WhatsApp refused it.
function ChannelPostBar({ sessionId, channelId }: ChannelPostBarProps) {
  const { t } = useTranslation();
  const { canWrite } = useRole();
  const { error: showErrorToast } = useToast();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [sending, setSending] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const toSend = text.trim();
    if (sending || !toSend || !canWrite) return;
    setSending(true);
    try {
      await messageApi.sendText(sessionId, channelId, toSend, buildChannelTextOptions(previewEnabled));
      setText('');
      void queryClient.invalidateQueries({ queryKey: ['channel-messages', sessionId, channelId] });
    } catch (err) {
      showErrorToast(t('chats.errors.send'), err instanceof Error ? err.message : undefined);
      void queryClient.invalidateQueries({ queryKey: ['channels', sessionId] });
    } finally {
      setSending(false);
    }
  };

  return (
    <footer className="room-input-footer">
      <ComposerInputBar
        value={text}
        onChange={setText}
        onSubmit={e => void handleSubmit(e)}
        placeholder={canWrite ? t('chats.channels.postPlaceholder') : t('chats.noPermission')}
        canWrite={canWrite}
        sending={sending}
        canSubmit={Boolean(text.trim())}
        attach={{ onClick: () => undefined, disabled: true, title: t('chats.channels.attachUnsupported') }}
      >
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
