import { useState } from 'react';

const key = 'vlog-caption-copy-v1';
export function useCaptionCopyOptions() {
  const [autoAfter, setAutoAfter] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key) ?? 'null')?.autoAfter === true; } catch { return false; }
  });
  return { autoAfter, setAutoAfter(value: boolean) {
    setAutoAfter(value);
    try { localStorage.setItem(key, JSON.stringify({ autoAfter: value })); } catch { /* Keep the option usable when local storage is unavailable. */ }
  } };
}
