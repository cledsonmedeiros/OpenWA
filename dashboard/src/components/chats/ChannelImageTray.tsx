import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, X } from 'lucide-react';

export interface TrayImage {
  id: string;
  name: string;
  previewUrl: string;
}

interface ChannelImageTrayProps {
  items: TrayImage[];
  disabled: boolean;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}

// The images of a channel batch in posting order. Reordering is by buttons rather than drag so it
// works from the keyboard and with a screen reader, each labelled with the image it moves.
function ChannelImageTray({ items, disabled, onMove, onRemove }: ChannelImageTrayProps) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <ol className="channel-image-tray composer-banner">
      {items.map((item, index) => (
        <li key={item.id} data-name={item.name} className="channel-image-tray-item">
          <img src={item.previewUrl} alt={item.name} className="preview-thumbnail" />
          <span className="channel-image-tray-index">{index + 1}</span>
          <div className="channel-image-tray-actions">
            <button
              type="button"
              disabled={disabled || index === 0}
              onClick={() => onMove(index, index - 1)}
              aria-label={t('chats.channels.moveUp', { name: item.name })}
              title={t('chats.channels.moveUp', { name: item.name })}
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              disabled={disabled || index === items.length - 1}
              onClick={() => onMove(index, index + 1)}
              aria-label={t('chats.channels.moveDown', { name: item.name })}
              title={t('chats.channels.moveDown', { name: item.name })}
            >
              <ArrowDown size={14} />
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onRemove(index)}
              aria-label={t('chats.channels.removeImage', { name: item.name })}
              title={t('chats.channels.removeImage', { name: item.name })}
            >
              <X size={14} />
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default ChannelImageTray;
