import { useEffect, useRef, useState } from 'react';
import { emptyCaptionLibrary, type CaptionLibrary } from './shared/captions';

// Style cards and multi-text groups share one snapshot, so saving either preserves the other.
export function useCaptionLibrary(onError: (message: string) => void) {
  const [library, setLibrary] = useState<CaptionLibrary>(emptyCaptionLibrary);
  const [loaded, setLoaded] = useState(false), [saving, setSaving] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    let live = true;
    void window.editor.captionPresets().then(value => { if (live) { setLibrary(value); setLoaded(true); } })
      .catch(error => { if (live) onError(`보관함을 불러오지 못했습니다: ${String(error)}`); });
    return () => { live = false; };
  }, [onError]);
  async function persist(next: CaptionLibrary) {
    if (!loaded || pending.current) return false;
    pending.current = true; setSaving(true);
    try { await window.editor.saveCaptionPresets(next); setLibrary(next); return true; }
    catch (error) { onError(`보관함 저장 실패: ${String(error)}`); return false; }
    finally { pending.current = false; setSaving(false); }
  }
  return { library, loaded, saving, persist };
}
