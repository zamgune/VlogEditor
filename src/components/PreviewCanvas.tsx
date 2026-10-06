import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CanvasSettings } from '../shared/canvas';
import { viewerGeometry, type ViewerGeometry, type ViewSettings } from '../shared/viewer';

type Warning = { text: string; message: string };
export const ViewerContext = createContext<{ geometry: ViewerGeometry; warn(id: string, text: string, message: string): void } | null>(null);
export function PreviewCanvas({ settings, view, disabled, onSelect, children }: { settings: CanvasSettings; view: ViewSettings; disabled: boolean; onSelect(id: string): void; children: ReactNode }) {
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [warnings, setWarnings] = useState<Record<string, Warning>>({});
  const geometry = useMemo(() => viewerGeometry(settings, view), [settings.width, settings.height, view]);
  const warn = useCallback((id: string, text: string, message: string) => setWarnings(old => {
    if ((!message && !old[id]) || (old[id]?.text === text && old[id]?.message === message)) return old;
    const next = { ...old }; if (message) next[id] = { text, message }; else delete next[id]; return next;
  }), []);
  const context = useMemo(() => ({ geometry, warn }), [geometry, warn]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(stage.current!); return () => observer.disconnect();
  }, []);
  const scale = Math.max(0, Math.min(size.width / geometry.width, size.height / geometry.height));
  const percent = (rect: { left: number; top: number; width: number; height: number }) => ({ left: `${rect.left / geometry.width * 100}%`, top: `${rect.top / geometry.height * 100}%`, width: `${rect.width / geometry.width * 100}%`, height: `${rect.height / geometry.height * 100}%` });
  return <ViewerContext.Provider value={context}>
    <div className="preview-stage" ref={stage}>
      <div className={`device-viewport ${view.mode === 'device' ? 'device-on' : ''}`} data-testid="device-viewport" style={{ width: geometry.width * scale, height: geometry.height * scale }}>
        <div className="preview-canvas" data-testid="preview-canvas" style={{ ...percent(geometry.video), backgroundColor: settings.background }}>{children}</div>
        {geometry.enabled && <div className="safe-area-overlay" data-testid="safe-area-overlay" aria-hidden="true">
          {geometry.areas.map(a => <div className={`unsafe-area unsafe-${a.id}`} key={a.id} style={percent(a)}><span>{a.label}</span></div>)}
          <div className="safe-area-outline" style={percent(geometry.safe)} />
        </div>}
      </div>
    </div>
    {geometry.enabled && <div className={`safe-warning-strip ${Object.keys(warnings).length ? 'has-warnings' : ''}`} role="status" aria-live="polite" aria-label="현재 화면 가림 확인">
      {Object.keys(warnings).length ? <><strong>주의 {Object.keys(warnings).length}</strong>{Object.entries(warnings).map(([id, w]) => <button key={id} disabled={disabled} title={`${w.text} · ${w.message}`} onClick={() => onSelect(id)}>{w.text.slice(0, 24)} · {w.message}</button>)}</> : <span>현재 화면의 글이 예상 가림 영역과 겹치지 않습니다.</span>}
    </div>}
  </ViewerContext.Provider>;
}
