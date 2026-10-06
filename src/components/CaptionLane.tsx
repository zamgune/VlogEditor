import { useEffect, useRef, type PointerEvent } from 'react';
import { captionSpans, captionRows, KIND_LABEL, type CaptionKind, type Caption } from '../shared/captions';
import type { Project } from '../shared/project';
export function CaptionLane({ project, kind, zoom, selected, disabled, onSelect, onRange, onBegin, onEnd }: {
  project: Project; kind: CaptionKind; zoom: number; selected?: string; disabled: boolean;
  onSelect(id: string): void; onRange(id: string, a: number, b: number): void; onBegin(): void; onEnd(cancelled?: boolean): void;
}) {
  const drag = useRef<{ x: number; scroll: number; zoom: number; caption: Caption; edge: 'start' | 'end' | 'move'; node: HTMLDivElement; pointerId: number; moved: boolean; atOrigin: boolean } | null>(null);
  const latest = useRef({ onRange, onEnd }); latest.current = { onRange, onEnd };
  function end(cancelled = false) { const d = drag.current; if (!d) return; drag.current = null; if (d.node.hasPointerCapture(d.pointerId)) d.node.releasePointerCapture(d.pointerId); latest.current.onEnd(cancelled || d.atOrigin); }
  useEffect(() => { const fn = (e: KeyboardEvent) => { if (e.key === 'Escape' && drag.current) { e.preventDefault(); e.stopImmediatePropagation(); end(true); } }; const blur = () => end(true); window.addEventListener('keydown', fn, true); window.addEventListener('blur', blur); return () => { window.removeEventListener('keydown', fn, true); window.removeEventListener('blur', blur); }; }, []);
  function start(e: PointerEvent<HTMLDivElement>, caption: Caption) {
    if (disabled || e.button !== 0 || drag.current) return; e.preventDefault(); e.stopPropagation(); e.currentTarget.focus(); onSelect(caption.id); if (caption.kind === 'title') return; onBegin();
    const edge = (e.target as HTMLElement).dataset.edge as 'start' | 'end' | undefined;
    const clip = project.clips.find(c => c.id === caption.clipId)!;
    // A video trim can hide part of the stored caption. Drag the visible interval.
    const visible = { ...caption, inFrame: Math.max(clip.inFrame, caption.inFrame), outFrame: Math.min(clip.outFrame, caption.outFrame) };
    // Row packing reorders caption DOM nodes while dragging across overlaps.
    // Capture on the stable lane so moving a block cannot cancel the gesture.
    const node = e.currentTarget.parentElement as HTMLDivElement;
    drag.current = { x: e.clientX, scroll: node.closest('.track-scroll')!.scrollLeft, zoom, caption: visible, edge: edge ?? 'move', node, pointerId: e.pointerId, moved: false, atOrigin: true }; node.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current; if (!d || e.pointerId !== d.pointerId) return; e.stopPropagation();
    const scroll = e.currentTarget.closest('.track-scroll')!.scrollLeft;
    let delta = Math.round((e.clientX - d.x + scroll - d.scroll) / d.zoom * 30);
    const c = d.caption;
    d.atOrigin = delta === 0;
    if (d.atOrigin && !d.moved) return;
    d.moved = true;
    if (d.edge === 'move') {
      const clip = project.clips.find(v => v.id === c.clipId)!;
      const min = clip.inFrame, max = clip.outFrame;
      delta = Math.max(min - c.inFrame, Math.min(max - c.outFrame, delta));
      d.atOrigin = delta === 0;
      // Move both edges together; clamping against the OLD opposite edge stretches
      // short captions whenever they move farther than their own duration.
      latest.current.onRange(c.id, c.inFrame + delta, c.outFrame + delta);
      return;
    }
    latest.current.onRange(c.id, d.edge === 'end' ? c.inFrame : Math.min(c.outFrame - 1, c.inFrame + delta), d.edge === 'start' ? c.outFrame : Math.max(c.inFrame + 1, c.outFrame + delta));
  }
  const rows = captionRows(captionSpans(project).filter(s => s.caption.kind === kind));
  return <div className={`caption-lane ${kind}`} style={{ height: rows.length * 34 }} aria-label={`${KIND_LABEL[kind]} 트랙`} onPointerDown={e => e.stopPropagation()} onPointerMove={move} onPointerUp={e => { if (drag.current?.pointerId === e.pointerId) { move(e); end(); } }} onPointerCancel={() => end(true)} onLostPointerCapture={() => end(true)}>{rows.flatMap((row, i) => row.map(s => <div role="button" tabIndex={disabled ? -1 : 0} key={s.caption.id} data-testid="caption-block" data-caption-id={s.caption.id} aria-label={`${KIND_LABEL[kind]} ${s.caption.text}`} className={`caption-block ${selected === s.caption.id ? 'selected' : ''}`} style={{ top: i * 34 + 4, left: s.start / 30 * zoom, width: Math.max(2, (s.end - s.start) / 30 * zoom) }} onPointerDown={e => start(e, s.caption)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onSelect(s.caption.id); } }}>
    {kind !== 'title' && <span data-edge="start" className="caption-edge start" aria-label="자막 시작 조절" title="끌어서 시작 시간 조절" />}<span className="caption-block-text" title={kind === 'title' ? s.caption.text : `${s.caption.text} · 가운데를 끌어 시간 이동, 양끝을 끌어 길이 조절`}>{s.caption.text || '(빈 자막)'}</span>{kind !== 'title' && <span data-edge="end" className="caption-edge end" aria-label="자막 끝 조절" title="끌어서 끝 시간 조절" />}
  </div>))}</div>;
}
