import { useEffect, useRef, type PointerEvent } from 'react';
import { captionSpans, captionRows, KIND_LABEL, type CaptionKind, type Caption } from '../shared/captions';
import type { Project } from '../shared/project';
export function CaptionLane({ project, kind, zoom, selected, disabled, onSelect, onRange, onBegin, onEnd }: {
  project: Project; kind: CaptionKind; zoom: number; selected?: string; disabled: boolean;
  onSelect(id: string): void; onRange(id: string, a: number, b: number): void; onBegin(): void; onEnd(cancelled?: boolean): void;
}) {
  const drag = useRef<{ x: number; scroll: number; zoom: number; caption: Caption; edge: 'start' | 'end' | 'move'; node: HTMLDivElement; pointerId: number } | null>(null);
  const latest = useRef({ onRange, onEnd }); latest.current = { onRange, onEnd };
  function end(cancelled = false) { const d = drag.current; if (!d) return; drag.current = null; if (d.node.hasPointerCapture(d.pointerId)) d.node.releasePointerCapture(d.pointerId); latest.current.onEnd(cancelled); }
  useEffect(() => { const fn = (e: KeyboardEvent) => { if (e.key === 'Escape' && drag.current) { e.preventDefault(); e.stopImmediatePropagation(); end(true); } }; const blur = () => end(true); window.addEventListener('keydown', fn, true); window.addEventListener('blur', blur); return () => { window.removeEventListener('keydown', fn, true); window.removeEventListener('blur', blur); }; }, []);
  function start(e: PointerEvent<HTMLDivElement>, caption: Caption) {
    if (disabled || e.button !== 0) return; e.preventDefault(); e.stopPropagation(); onSelect(caption.id); if (caption.kind === 'title') return; onBegin();
    const edge = (e.target as HTMLElement).dataset.edge as 'start' | 'end' | undefined;
    drag.current = { x: e.clientX, scroll: e.currentTarget.closest('.track-scroll')!.scrollLeft, zoom, caption, edge: edge ?? 'move', node: e.currentTarget, pointerId: e.pointerId }; e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current; if (!d) return; e.stopPropagation();
    const scroll = e.currentTarget.closest('.track-scroll')!.scrollLeft;
    let delta = Math.round((e.clientX - d.x + scroll - d.scroll) / d.zoom * 30);
    const c = d.caption;
    if (d.edge === 'move') {
      const clip = project.clips.find(v => v.id === c.clipId)!;
      const min = clip.inFrame, max = clip.outFrame;
      delta = Math.max(min - c.inFrame, Math.min(max - c.outFrame, delta));
    }
    latest.current.onRange(c.id, d.edge === 'end' ? c.inFrame : Math.min(c.outFrame - 1, c.inFrame + delta), d.edge === 'start' ? c.outFrame : Math.max(c.inFrame + 1, c.outFrame + delta));
  }
  const rows = captionRows(captionSpans(project).filter(s => s.caption.kind === kind));
  return <div className={`caption-lane ${kind}`} style={{ height: rows.length * 34 }} aria-label={`${KIND_LABEL[kind]} 트랙`} onPointerDown={e => e.stopPropagation()}>{rows.flatMap((row, i) => row.map(s => <div role="button" tabIndex={disabled ? -1 : 0} key={s.caption.id} data-testid="caption-block" data-caption-id={s.caption.id} aria-label={`${KIND_LABEL[kind]} ${s.caption.text}`} className={`caption-block ${selected === s.caption.id ? 'selected' : ''}`} style={{ top: i * 34 + 4, left: s.start / 30 * zoom, width: Math.max(2, (s.end - s.start) / 30 * zoom) }} onPointerDown={e => start(e, s.caption)} onPointerMove={move} onPointerUp={e => { if (drag.current) { move(e); end(); } }} onPointerCancel={() => end(true)} onLostPointerCapture={() => end(true)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onSelect(s.caption.id); } }}>
    {kind !== 'title' && <span data-edge="start" className="caption-edge start" aria-label="자막 시작 조절" />}{s.caption.text || '(빈 자막)'}{kind !== 'title' && <span data-edge="end" className="caption-edge end" aria-label="자막 끝 조절" />}
  </div>))}</div>;
}
