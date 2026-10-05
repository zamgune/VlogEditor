import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CanvasSettings } from '../shared/canvas';

export function PreviewCanvas({ settings, children }: { settings: CanvasSettings; children: ReactNode }) {
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(stage.current!); return () => observer.disconnect();
  }, []);
  const width = Math.max(0, Math.min(size.width, size.height * settings.width / settings.height));
  return <div className="preview-stage" ref={stage}>
    <div className="preview-canvas" data-testid="preview-canvas" style={{ width, height: width * settings.height / settings.width, backgroundColor: settings.background }}>
      {children}
    </div>
  </div>;
}
