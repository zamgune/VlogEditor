import { useEffect, useState } from 'react';
import { defaultViewSettings, parseViewSettings, type ViewSettings } from './shared/viewer';
export const VIEW_SETTINGS_KEY = 'vlog-viewer-v1';
export function useViewerSettings() {
  const [view, setView] = useState(() => {
    try { return parseViewSettings(JSON.parse(localStorage.getItem(VIEW_SETTINGS_KEY) ?? 'null')); } catch { return defaultViewSettings(); }
  });
  useEffect(() => { try { localStorage.setItem(VIEW_SETTINGS_KEY, JSON.stringify(view)); } catch { /* Keep the viewer usable if storage is unavailable. */ } }, [view]);
  return { view, update: (patch: Partial<ViewSettings>) => setView(v => parseViewSettings({ ...v, ...patch })) };
}
