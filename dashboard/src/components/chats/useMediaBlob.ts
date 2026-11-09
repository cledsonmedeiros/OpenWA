import { useEffect, useRef, useState } from 'react';
import { keepsSameKey } from '../../utils/authLifecycle';
import { loadArchivedMedia } from '../../utils/archivedMediaLoad';

export interface MediaBlobState {
  src: string | null;
  /** The downloaded blob's MIME type, for callers that do not know the media kind up front. */
  type: string;
  error: boolean;
}

/**
 * Fetches an authenticated media blob and exposes it as an object URL. `<img src="/api/...">` cannot carry
 * the X-API-Key header, so the bytes go through sessionApi (which does). The fetches take their turns a gap
 * apart and a refusal for rate is retried (loadArchivedMedia). The URL is revoked when `key` changes or the
 * caller unmounts, so browsing a feed does not leak blob memory. Logout cancels nothing in flight, so a
 * download that lands after the stored API key changed is dropped and its refusal not retried
 * (keepsSameKey). `load` is read at fetch time; `key` decides when to fetch again.
 */
export function useMediaBlob(key: string | null, load: (signal: AbortSignal) => Promise<Blob>): MediaBlobState {
  const [state, setState] = useState<MediaBlobState>({ src: null, type: '', error: false });
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (key === null) return undefined;
    let objectUrl: string | null = null;
    let cancelled = false;
    const sameKey = keepsSameKey();
    const controller = new AbortController();
    setState({ src: null, type: '', error: false });
    loadArchivedMedia(controller.signal, () => {
      if (!sameKey()) throw new DOMException('Aborted', 'AbortError');
      return loadRef.current(controller.signal);
    })
      .then(blob => {
        if (cancelled || !sameKey()) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ src: objectUrl, type: blob.type, error: false });
      })
      .catch(() => {
        if (!cancelled && sameKey()) setState({ src: null, type: '', error: true });
      });
    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key]);

  return state;
}
