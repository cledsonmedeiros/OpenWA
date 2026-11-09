import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { messageApi, type ChannelMessage } from '../../services/api';
import { useToast } from '../../hooks/useToast';

/**
 * Deletes a channel post for everyone, after a confirmation, through the message delete route (which
 * revokes a channel post with WhatsApp Web's own newsletter action). Rendered only where the session owns
 * or administers the channel. The post leaves the cached feed at once; a refusal keeps it and says why.
 */
function ChannelPostDelete({
  sessionId,
  channelId,
  messageId,
}: {
  sessionId: string;
  channelId: string;
  messageId: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { error: showErrorToast } = useToast();
  const [pending, setPending] = useState(false);

  const onDelete = async () => {
    if (!window.confirm(t('chats.deleteConfirm'))) return;
    setPending(true);
    try {
      await messageApi.delete(sessionId, { chatId: channelId, messageId, forEveryone: true });
      queryClient.setQueryData<ChannelMessage[]>(['channel-messages', sessionId, channelId], old =>
        old?.filter(m => m.id !== messageId),
      );
    } catch (err) {
      showErrorToast(t('chats.errors.delete'), err instanceof Error ? err.message : undefined);
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      className="channel-post-delete"
      onClick={() => void onDelete()}
      disabled={pending}
      aria-label={t('chats.actions.delete')}
      title={t('chats.actions.delete')}
    >
      <Trash2 size={14} />
    </button>
  );
}

export default ChannelPostDelete;
