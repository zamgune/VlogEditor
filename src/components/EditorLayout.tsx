import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
const DEFAULT = { left: 232, right: 300, timeline: 302 };
type Layout = typeof DEFAULT;
export function useEditorLayout() {
  const [layout, setLayout] = useState<Layout>(() => {
    try { const p = JSON.parse(localStorage.getItem('vlog-layout-v1') ?? 'null'); return p && Object.keys(DEFAULT).every(k => Number.isFinite(p[k])) ? p : DEFAULT; } catch { return DEFAULT; }
  });
  const [large, setLarge] = useState(false);
  const [windowSize, setWindowSize] = useState({ width: innerWidth, height: innerHeight });
  useEffect(() => { const fn = () => setWindowSize({ width: innerWidth, height: innerHeight }); window.addEventListener('resize', fn); return () => window.removeEventListener('resize', fn); }, []);
  useEffect(() => { localStorage.setItem('vlog-layout-v1', JSON.stringify(layout)); }, [layout]);
  useEffect(() => { const fn = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) setLarge(false); }; window.addEventListener('keydown', fn); return () => window.removeEventListener('keydown', fn); }, []);
  const left = Math.max(180, Math.min(380, layout.left));
  const right = Math.max(250, Math.min(440, layout.right, windowSize.width - left - 370));
  const timeline = Math.max(220, Math.min(windowSize.height - 380, layout.timeline));
  return { large, toggle: () => setLarge(v => !v), reset: () => { setLayout(DEFAULT); setLarge(false); },
    style: { '--library-width': `${left}px`, '--inspector-width': `${right}px`, '--timeline-height': `${large ? 160 : timeline}px` } as CSSProperties,
    resize: (key: keyof Layout, delta: number) => setLayout(v => ({ ...v, [key]: key === 'left' ? Math.max(180, Math.min(380, left + delta)) : key === 'right' ? Math.max(250, Math.min(440, right + delta)) : Math.max(220, Math.min(windowSize.height - 380, timeline + delta)) })) };
}
export function PanelDivider({ axis, label, onDelta, disabled }: { axis: 'x' | 'y'; label: string; onDelta(n: number): void; disabled?: boolean }) {
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  function move(e: PointerEvent) { const p = pointer.current; if (!p) return; onDelta(axis === 'x' ? e.clientX - p.x : e.clientY - p.y); p.x = e.clientX; p.y = e.clientY; }
  return <div role="separator" aria-label={label} aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'} tabIndex={disabled ? -1 : 0} className={`panel-divider divider-${axis}`}
    onPointerDown={e => { if (disabled || e.button !== 0) return; e.preventDefault(); pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }}
    onPointerMove={move} onPointerUp={e => { move(e); pointer.current = null; }} onPointerCancel={() => { pointer.current = null; }} onLostPointerCapture={() => { pointer.current = null; }}
    onKeyDown={e => { if (disabled) return; if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); onDelta(['ArrowLeft', 'ArrowUp'].includes(e.key) ? -10 : 10); } }} />;
}
