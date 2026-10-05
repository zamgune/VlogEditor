import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { CaptionLane } from './CaptionLane';
import { narrationEnd, narrationRows, type Narration } from '../shared/narration';
import { captionRows, captionSpans, KIND_LABEL } from '../shared/captions';
import { duration, timecode, type Clip, type Project } from '../shared/project';
import { edgeScrollSpeed, pointerFrame, reorderTarget, trimFromDrag, type TrimEdge } from '../shared/timeline';

type Props = { onNarrationSelect(n: Narration): void; selectedCaption?: string; onCaptionSelect(id: string): void; onCaptionRange(id: string, a: number, b: number): void; onCaptionBegin(): void; onCaptionEnd(cancelled?: boolean): void; project: Project; selected?: string; frame: number; zoom: number; disabled: boolean;
  onSeek(frame: number): void; onZoom(zoom: number): void; onSelect(id: string): void;
  onScrubChange(scrubbing: boolean): void; onReorder(from: number, to: number): void;
  onMoveChange(moving: boolean): void;
  trimming: { clipId: string; edge: TrimEdge } | null;
  onTrimBegin(clipId: string, edge: TrimEdge): void;
  onTrimPreview(clipId: string, inFrame: number, outFrame: number, edge: TrimEdge): void;
  onTrimEnd(cancelled: boolean): void };
type Gesture = { pointerId: number; mode: 'scrub'; x: number; lastX: number }
  | { pointerId: number; mode: 'pan'; x: number; lastX: number }
  | { pointerId: number; mode: 'move'; x: number; y: number; originX: number; originY: number;
      clips: Clip[]; from: number; zoom: number; offset: number; dragged: boolean; to: number; allowed: boolean }
  | { pointerId: number; mode: 'trim'; x: number; originX: number; originScroll: number; zoom: number;
      clip: Clip; edge: TrimEdge; sourceFrames: number; scrollWidth: number; lastIn: number; lastOut: number };
export function Timeline(props: Props) {
  const { project, selected, frame, zoom, disabled, onSeek, onZoom, onSelect, onScrubChange } = props;
  const viewport = useRef<HTMLDivElement>(null);
  const trackLabels = useRef<HTMLDivElement>(null);
  const videoTrack = useRef<HTMLDivElement>(null);
  const latest = useRef(props); latest.current = props;
  const gesture = useRef<Gesture | null>(null);
  const animation = useRef(0);
  const [movePreview, setMovePreview] = useState<{ clipId: string; from: number; to: number; left: number; boundary: number; allowed: boolean } | null>(null);
  const zoomAnchor = useRef<{ seconds: number; x: number } | null>(null);
  const total = duration(project);
  const voiceRows = useMemo(() => narrationRows(project.narrations, total), [project.narrations, total]);
  const width = Math.max(800, total / 30 * zoom + 80, gesture.current?.mode === 'trim' ? gesture.current.scrollWidth : 0);
  const ghostWidth = movePreview ? Math.max(100, (project.clips[movePreview.from].outFrame - project.clips[movePreview.from].inFrame) / 30 * zoom) : 0;
  const tickSeconds = zoom < 45 ? 5 : zoom < 90 ? 2 : 1;
  function applyScrub(clientX: number) {
    const view = viewport.current; if (!view) return;
    const p = latest.current;
    p.onSeek(pointerFrame(clientX, view.getBoundingClientRect().left, view.scrollLeft, p.zoom, duration(p.project)));
  }
  function applyTrim(active: Extract<Gesture, { mode: 'trim' }>) {
    const view = viewport.current; if (!view) return;
    const delta = (active.x - active.originX + view.scrollLeft - active.originScroll) / active.zoom * 30;
    const next = trimFromDrag(active.clip, active.edge, delta, active.sourceFrames);
    if (next.inFrame === active.lastIn && next.outFrame === active.lastOut) return;
    active.lastIn = next.inFrame; active.lastOut = next.outFrame;
    latest.current.onTrimPreview(active.clip.id, next.inFrame, next.outFrame, active.edge);
  }
  function applyMove(active: Extract<Gesture, { mode: 'move' }>) {
    if (!active.dragged && Math.hypot(active.x - active.originX, active.y - active.originY) < 5) return;
    active.dragged = true;
    const view = viewport.current!, track = videoTrack.current!;
    const bounds = view.getBoundingClientRect(), trackBounds = track.getBoundingClientRect();
    const contentX = active.x - bounds.left + view.scrollLeft;
    const target = reorderTarget(active.clips, active.from, contentX / active.zoom * 30);
    active.to = target.to;
    active.allowed = active.x >= bounds.left && active.x <= bounds.right && active.y >= trackBounds.top && active.y <= trackBounds.bottom;
    const next = { clipId: active.clips[active.from].id, from: active.from, to: target.to,
      left: Math.round(contentX - active.offset), boundary: target.boundary / 30 * active.zoom, allowed: active.allowed };
    setMovePreview(previous => previous && Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
  }
  function endGesture(cancelled = false) {
    const active = gesture.current;
    if (!active) return;
    if (active.mode === 'scrub') applyScrub(active.x);
    else if (active.mode === 'pan' && viewport.current) viewport.current.scrollLeft += active.lastX - active.x;
    else if (active.mode === 'trim' && !cancelled) applyTrim(active);
    else if (active.mode === 'move' && !cancelled) applyMove(active);
    gesture.current = null; cancelAnimationFrame(animation.current);
    if (viewport.current?.hasPointerCapture(active.pointerId)) viewport.current.releasePointerCapture(active.pointerId);
    if (active.mode === 'trim') latest.current.onTrimEnd(cancelled);
    if (active.mode === 'move') {
      setMovePreview(null); latest.current.onMoveChange(false);
      if (!cancelled && active.dragged && active.allowed && active.to !== active.from)
        latest.current.onReorder(active.from, active.to);
    }
    latest.current.onScrubChange(false);
  }
  function animateGesture() {
    const view = viewport.current!;
    let previousTime = performance.now();
    const tick = (time: number) => {
      const active = gesture.current; if (!active) return;
      if (active.mode !== 'pan') {
        const rect = view.getBoundingClientRect();
        if (active.mode === 'scrub' || (active.mode === 'move' ? active.dragged && active.allowed : Math.abs(active.x - active.originX) > 2))
          view.scrollLeft += edgeScrollSpeed(active.x, rect.left, rect.right) * Math.min(0.04, (time - previousTime) / 1000);
        if (active.mode === 'scrub') applyScrub(active.x); else if (active.mode === 'trim') applyTrim(active); else applyMove(active);
      } else { view.scrollLeft += active.lastX - active.x; active.lastX = active.x; }
      previousTime = time; animation.current = requestAnimationFrame(tick);
    };
    animation.current = requestAnimationFrame(tick);
  }
  function startMove(e: PointerEvent<HTMLElement>, from: number, start: number) {
    if (disabled || e.button !== 0 || gesture.current) return;
    e.preventDefault(); e.stopPropagation();
    const view = viewport.current!; view.focus({ preventScroll: true });
    const contentX = e.clientX - view.getBoundingClientRect().left + view.scrollLeft;
    const clip = project.clips[from];
    gesture.current = { pointerId: e.pointerId, mode: 'move', x: e.clientX, y: e.clientY, originX: e.clientX, originY: e.clientY,
      clips: project.clips, from, zoom, offset: contentX - start / 30 * zoom, dragged: false, to: from, allowed: true };
    view.setPointerCapture(e.pointerId);
    onSelect(clip.id); onSeek(Math.max(start, Math.min(start + clip.outFrame - clip.inFrame - 1, Math.round(contentX / zoom * 30))));
    latest.current.onMoveChange(true);
    animateGesture();
  }
  function startTrim(e: PointerEvent<HTMLButtonElement>, clip: Clip, edge: TrimEdge, sourceFrames: number) {
    if (disabled || e.button !== 0 || gesture.current) return;
    e.preventDefault(); e.stopPropagation();
    const view = viewport.current!; view.focus({ preventScroll: true });
    gesture.current = { pointerId: e.pointerId, mode: 'trim', x: e.clientX, originX: e.clientX, originScroll: view.scrollLeft,
      zoom, clip, edge, sourceFrames, scrollWidth: view.scrollWidth, lastIn: clip.inFrame, lastOut: clip.outFrame };
    view.setPointerCapture(e.pointerId);
    latest.current.onTrimBegin(clip.id, edge); latest.current.onScrubChange(true);
    animateGesture();
  }
  function startGesture(e: PointerEvent<HTMLDivElement>) {
    if (disabled || !total || gesture.current || (e.button !== 0 && e.button !== 1) || (e.target as HTMLElement).closest('.reorder-grip,.trim-handle')) return;
    e.preventDefault();
    const view = viewport.current!;
    const bounds = view.getBoundingClientRect();
    // Leave the native horizontal scrollbar available for mouse dragging.
    if (e.clientY >= bounds.top + view.clientHeight) return;
    view.focus({ preventScroll: true });
    endGesture();
    gesture.current = { pointerId: e.pointerId, mode: e.button === 1 ? 'pan' : 'scrub', x: e.clientX, lastX: e.clientX };
    view.setPointerCapture(e.pointerId);
    if (e.button === 0) { onScrubChange(true); applyScrub(e.clientX); }
    animateGesture();
  }
  useEffect(() => {
    const view = viewport.current!;
    const wheel = (e: WheelEvent) => {
      if (latest.current.disabled) return;
      e.preventDefault();
      const delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * (e.deltaMode === 1 ? 20 : e.deltaMode === 2 ? view.clientWidth : 1);
      if (e.shiftKey && !e.ctrlKey) { view.scrollTop += delta; return; }
      if (e.ctrlKey && (gesture.current?.mode === 'trim' || gesture.current?.mode === 'move')) return;
      if (e.ctrlKey) {
        const x = e.clientX - view.getBoundingClientRect().left;
        zoomAnchor.current = { seconds: (x + view.scrollLeft) / latest.current.zoom, x };
        latest.current.onZoom(Math.max(20, Math.min(160, Math.round(latest.current.zoom * Math.exp(-delta * 0.002)))));
      } else { view.scrollLeft += delta; if (gesture.current?.mode === 'scrub') applyScrub(gesture.current.x); else if (gesture.current?.mode === 'trim') applyTrim(gesture.current); else if (gesture.current?.mode === 'move') applyMove(gesture.current); }
    };
    view.addEventListener('wheel', wheel, { passive: false });
    const blur = () => endGesture(true); window.addEventListener('blur', blur);
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape' && (gesture.current?.mode === 'trim' || gesture.current?.mode === 'move')) { e.preventDefault(); endGesture(true); } };
    window.addEventListener('keydown', escape);
    return () => { view.removeEventListener('wheel', wheel); window.removeEventListener('blur', blur); window.removeEventListener('keydown', escape); cancelAnimationFrame(animation.current); };
  }, []);
  useEffect(() => { if (disabled) endGesture(true); }, [disabled]);
  useLayoutEffect(() => {
    if (zoomAnchor.current && viewport.current) {
      viewport.current.scrollLeft = zoomAnchor.current.seconds * zoom - zoomAnchor.current.x;
      zoomAnchor.current = null;
    }
  }, [zoom]);
  const captionTracks = useMemo(() => { const spans = captionSpans(project); return (['normal', 'emphasis', 'title'] as const).map(kind => ({ kind, count: captionRows(spans.filter(s => s.caption.kind === kind)).length })); }, [project]);
  let trackStart = 0;
  return <div className="track-area"><div className="track-labels" ref={trackLabels}><div className="ruler-label">분:초:프레임</div><div>▰ <strong>영상</strong><span>{project.clips.length}</span></div><div className="narration-track-label" style={{ height: voiceRows.length * 32 }}>● 음성 녹음</div>{captionTracks.map(({ kind, count }) => <div key={kind} className={`caption-track-label ${kind}`} style={{ height: count * 34 }}>T {KIND_LABEL[kind]}{count > 1 ? ` · ${count}줄` : ''}</div>)}</div>
    <div className={`track-scroll ${movePreview ? 'moving-clip' : ''}`} ref={viewport} onScroll={e => { if (trackLabels.current) trackLabels.current.style.transform = `translateY(${-e.currentTarget.scrollTop}px)`; }} tabIndex={-1} onPointerDown={startGesture}
      onPointerMove={e => { if (gesture.current?.pointerId === e.pointerId) { gesture.current.x = e.clientX; if (gesture.current.mode === 'move') gesture.current.y = e.clientY; } }}
      onPointerUp={e => { if (gesture.current?.pointerId === e.pointerId) { gesture.current.x = e.clientX; if (gesture.current.mode === 'move') gesture.current.y = e.clientY; endGesture(); } }}
      onPointerCancel={() => endGesture(true)} onLostPointerCapture={() => endGesture(true)}>
      <div className="track-content" style={{ width, minHeight: 102 + voiceRows.length * 32 + captionTracks.reduce((n, t) => n + t.count * 34, 0) }}>
        <div className="ruler" aria-label="타임라인 눈금">{Array.from({ length: Math.ceil(width / (zoom * tickSeconds)) }, (_, i) => <span key={i} style={{ left: i * zoom * tickSeconds }}>{timecode(i * tickSeconds * 30)}</span>)}</div>
        <div className="video-track" ref={videoTrack}>{project.clips.map((clip, i) => {
          const start = trackStart; trackStart += clip.outFrame - clip.inFrame;
          const media = project.media.find(m => m.id === clip.mediaId)!;
          return <div key={clip.id} data-testid="timeline-clip" role="button" tabIndex={disabled ? -1 : 0} aria-label={`클립 ${i + 1} ${media.name}`} aria-pressed={selected === clip.id}
            title="클릭해서 선택 · 누른 채 끌어서 위치 이동"
            className={`timeline-clip cover-${i % 3} ${selected === clip.id ? 'selected' : ''} ${props.trimming?.clipId === clip.id ? 'trimming' : ''} ${movePreview?.clipId === clip.id ? 'move-source' : ''} ${(clip.outFrame - clip.inFrame) / 30 * zoom < 44 ? 'compact-clip' : ''}`} style={{ width: (clip.outFrame - clip.inFrame) / 30 * zoom }}
            onPointerDown={e => startMove(e, i, start)}
            onKeyDown={e => { if (e.target === e.currentTarget && !disabled && !gesture.current && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); onSelect(clip.id); onSeek(start); } }}>
            <button className="trim-handle trim-start" aria-label={`클립 ${i + 1} 시작 길이 조절`} title="끌어서 시작 부분 자르기 · Esc 취소" disabled={disabled}
              onPointerDown={e => startTrim(e, clip, 'start', media.durationFrames)} onClick={e => e.stopPropagation()}>│</button>
            <button className="trim-handle trim-end" aria-label={`클립 ${i + 1} 끝 길이 조절`} title="끌어서 끝 부분 자르기 · 원본 범위에서 늘리기" disabled={disabled}
              onPointerDown={e => startTrim(e, clip, 'end', media.durationFrames)} onClick={e => e.stopPropagation()}>│</button>
            <button className="reorder-grip" aria-label={`클립 ${i + 1} 순서 이동`} title="잡고 끌어서 장면 순서 변경" disabled={disabled || !!props.trimming}
              onPointerDown={e => startMove(e, i, start)} onClick={e => { e.stopPropagation(); onSelect(clip.id); }}>⠿</button>
            <strong>{media.name}</strong><span>{timecode(clip.outFrame - clip.inFrame)}</span>
          </div>;
        })}{!total && <div className="empty-track">가져온 영상이 순서대로 놓입니다</div>}</div>
        {movePreview && <>
          {movePreview.allowed && movePreview.to !== movePreview.from && <div className="drop-marker" data-testid="drop-marker" style={{ left: movePreview.boundary }} />}
          <div className={`move-ghost cover-${movePreview.from % 3}`} data-testid="move-ghost" style={{ left: Math.max(0, Math.min(width - ghostWidth, movePreview.left)), width: ghostWidth }}>
            <strong>{project.media.find(m => m.id === project.clips[movePreview.from].mediaId)?.name}</strong>
            <span>{!movePreview.allowed ? '트랙 밖 · 놓으면 취소' : movePreview.to === movePreview.from ? '현재 위치' : `${movePreview.to + 1}번째로 이동`} · Esc 취소</span>
          </div>
        </>}
        <div className="narration-track" style={{ height: voiceRows.length * 32 }}>{voiceRows.flatMap((row, i) => row.map(n => <button key={n.id} data-testid="narration-block" className={n.muted ? 'muted' : ''} disabled={disabled} aria-label={`녹음 ${n.name}`} title={`${n.name} · ${timecode(n.startFrame)}부터`} style={{ left: n.startFrame / 30 * zoom, width: Math.max(3, (narrationEnd(n, total) - n.startFrame) / 30 * zoom), top: i * 32 + 2 }} onPointerDown={e => e.stopPropagation()} onClick={() => props.onNarrationSelect(n)}>● {n.name}</button>))}</div>
        {(['normal', 'emphasis', 'title'] as const).map(kind => <CaptionLane key={kind} kind={kind} project={project} zoom={zoom} selected={props.selectedCaption} disabled={disabled} onSelect={props.onCaptionSelect} onRange={props.onCaptionRange} onBegin={props.onCaptionBegin} onEnd={props.onCaptionEnd} />)}
        {total > 0 && <div className="playhead" style={{ left: frame / 30 * zoom }}><span role="slider" tabIndex={0} aria-label="재생 위치" aria-valuemin={0} aria-valuemax={total - 1} aria-valuenow={frame} aria-valuetext={timecode(frame)} title="잡고 끌어서 영상 탐색" /></div>}
      </div>
    </div>
  </div>;
}
