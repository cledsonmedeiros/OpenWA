import type { FormEvent, MutableRefObject, ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Send, Smile } from 'lucide-react';

export interface ComposerInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  placeholder: string;
  canWrite: boolean;
  sending: boolean;
  /** Whether there is something to send; the bar adds the canWrite/sending gates itself. */
  canSubmit: boolean;
  attach: { onClick: () => void; disabled: boolean; title: string };
  /** Omit to render no emoji toggle. */
  emoji?: { onToggle: () => void; active: boolean };
  inputRef?: Ref<HTMLInputElement>;
  /** Records how the send button was pressed ('touch' keeps the soft keyboard closed after a send). */
  sendPressRef?: MutableRefObject<string>;
  /** Rendered first inside the form: a hidden file input, extra controls. */
  children?: ReactNode;
}

// The input bar shared by the chat composer and the channel post bar. Presentational: the caller
// owns the send flow, what the attach button does, and whether an emoji toggle exists.
function ComposerInputBar({
  value,
  onChange,
  onSubmit,
  placeholder,
  canWrite,
  sending,
  canSubmit,
  attach,
  emoji,
  inputRef,
  sendPressRef,
  children,
}: ComposerInputBarProps) {
  const { t } = useTranslation();
  return (
    <form onSubmit={onSubmit} className="input-form">
      {children}

      <button
        type="button"
        onClick={attach.onClick}
        disabled={attach.disabled}
        className="btn-input-accessory"
        title={attach.title}
        aria-label={attach.title}
      >
        <Plus size={24} />
      </button>

      {/* The text field and the emoji toggle share one pill, as in WhatsApp. */}
      <div className="message-input-pill">
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          // Never disabled by a send: it holds focus through it, and the caller refuses a second send meanwhile.
          disabled={!canWrite}
          ref={inputRef}
          className="message-text-input"
        />
        {emoji && (
          <button
            type="button"
            onClick={emoji.onToggle}
            disabled={!canWrite || sending}
            className={`btn-input-accessory inside ${emoji.active ? 'active' : ''}`}
            title={t('chats.emojiTitle')}
            aria-label={t('chats.emojiTitle')}
          >
            <Smile size={22} />
          </button>
        )}
      </div>

      <button
        type="submit"
        disabled={!canWrite || !canSubmit || sending}
        onPointerDown={e => {
          if (sendPressRef) sendPressRef.current = e.pointerType;
        }}
        onKeyDown={() => {
          if (sendPressRef) sendPressRef.current = '';
        }}
        className="btn-send-message"
        aria-label={t('chats.send')}
        title={t('chats.send')}
      >
        {sending ? <Loader2 className="animate-spin" size={22} /> : <Send size={20} strokeWidth={2.25} />}
      </button>
    </form>
  );
}

export default ComposerInputBar;
