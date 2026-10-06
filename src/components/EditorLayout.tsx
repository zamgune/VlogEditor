import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { DEFAULT_WORKSPACE, WORKSPACE_STORAGE_KEY, splitPreviewWidth, workspacePreferences, type WorkspacePreferences } from '../shared/editor-layout';
const DEFAULT = { left: 280, right: 310, timeline: 230 };
type Layout = typeof DEFAULT;
export function useEditorLayout() {
  const [layout, setLayout] = useState<Layout>(() => {
    try { const p = JSON.parse(localStorage.getItem('vlog-layout-v2') ?? 'null'); return p && Object.keys(DEFAULT).every(k => Number.isFinite(p[k])) ? p : DEFAULT; } catch { return DEFAULT; }
  });
  const [large, setLarge] = useState(false);
  const [workspace, setWorkspace] = useState(() => {
    try { return workspacePreferences(JSON.parse(localStorage.getItem(WORKSPACE_STORAGE_KEY) ?? 'null')); } catch { return { ...DEFAULT_WORKSPACE }; }
  });
  const [libraryOpen, setLibraryOpen] = useState(false), [inspectorOpen, setInspectorOpen] = useState(false);
  const [windowSize, setWindowSize] = useState({ width: innerWidth, height: innerHeight });
  useEffect(() => { const fn = () => setWindowSize({ width: innerWidth, height: innerHeight }); window.addEventListener('resize', fn); return () => window.removeEventListener('resize', fn); }, []);
  useEffect(() => { try { localStorage.setItem('vlog-layout-v2', JSON.stringify(layout)); } catch { /* Optional local preference. */ } }, [layout]);
  useEffect(() => { try { localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspace)); } catch { /* Optional local preference. */ } }, [workspace]);
  useEffect(() => { const fn = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) setLarge(false); }; window.addEventListener('keydown', fn); return () => window.removeEventListener('keydown', fn); }, []);
  const left = Math.max(180, Math.min(380, layout.left));
  const right = Math.max(250, Math.min(440, layout.right, windowSize.width - left - 370));
  const minimumTimeline = windowSize.height < 650 ? 110 : 130;
  const largeTimeline = windowSize.height < 650 ? 110 : 160;
  const timeline = Math.max(minimumTimeline, Math.min(Math.max(minimumTimeline, windowSize.height - 360), layout.timeline));
  const splitTimeline = Math.max(120, Math.min(Math.max(120, windowSize.height - 310), workspace.timeline));
  const previewWidth = splitPreviewWidth(windowSize.width, workspace.previewShare);
  return { large, libraryOpen, inspectorOpen, mode: workspace.mode, previewSide: workspace.previewSide,
    setMode: (mode: WorkspacePreferences['mode']) => { setWorkspace(v => ({ ...v, mode })); setLarge(false); },
    swapPreview: () => setWorkspace(v => ({ ...v, previewSide: v.previewSide === 'left' ? 'right' : 'left' })),
    resizePreview: (delta: number) => setWorkspace(v => ({ ...v, previewShare: Math.max(.35, Math.min(.65, (previewWidth + (v.previewSide === 'left' ? delta : -delta)) / windowSize.width)) })),
    openLibrary: () => { setLibraryOpen(true); setInspectorOpen(false); },
    openInspector: () => { setInspectorOpen(true); setLibraryOpen(false); },
    closeLibrary: () => setLibraryOpen(false), closeInspector: () => setInspectorOpen(false),
    toggle: () => setLarge(v => !v), reset: () => { setLayout(DEFAULT); setWorkspace({ ...DEFAULT_WORKSPACE }); setLarge(false); setLibraryOpen(false); setInspectorOpen(false); },
    style: { '--library-width': `${libraryOpen ? left : 0}px`, '--inspector-width': `${inspectorOpen ? right : 0}px`, '--timeline-height': `${large ? Math.min(largeTimeline, timeline) : timeline}px`, '--split-preview-width': `${previewWidth}px`, '--split-timeline-height': `${splitTimeline}px` } as CSSProperties,
    resize: (key: keyof Layout, delta: number) => { if (key === 'timeline' && workspace.mode === 'split') { setWorkspace(v => ({ ...v, timeline: Math.max(120, Math.min(Math.max(120, windowSize.height - 310), splitTimeline + delta)) })); }
      else if (key === 'timeline' && large) { setLarge(false); setLayout(v => ({ ...v, timeline: Math.max(minimumTimeline, Math.min(Math.max(minimumTimeline, windowSize.height - 360), Math.min(largeTimeline, timeline) + delta)) })); }
      else setLayout(v => ({ ...v, [key]: key === 'left' ? Math.max(180, Math.min(380, left + delta)) : key === 'right' ? Math.max(250, Math.min(440, right + delta)) : Math.max(minimumTimeline, Math.min(Math.max(minimumTimeline, windowSize.height - 360), timeline + delta)) })); } };
}
export function PanelDivider({ axis, label, onDelta, disabled, className = '' }: { axis: 'x' | 'y'; label: string; onDelta(n: number): void; disabled?: boolean; className?: string }) {
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  function move(e: PointerEvent) { const p = pointer.current; if (!p) return; onDelta(axis === 'x' ? e.clientX - p.x : e.clientY - p.y); p.x = e.clientX; p.y = e.clientY; }
  return <div role="separator" aria-label={label} aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'} tabIndex={disabled ? -1 : 0} className={`panel-divider divider-${axis} ${className}`}
    onPointerDown={e => { if (disabled || e.button !== 0) return; e.preventDefault(); pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }}
    onPointerMove={move} onPointerUp={e => { move(e); pointer.current = null; }} onPointerCancel={() => { pointer.current = null; }} onLostPointerCapture={() => { pointer.current = null; }}
    onKeyDown={e => { if (disabled) return; if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); onDelta(['ArrowLeft', 'ArrowUp'].includes(e.key) ? -10 : 10); } }} />;
}
