import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { captionRect, activeCaptionSpans, captionTransform, effectiveStyle, type CaptionSpan, type CaptionBitmap, type CaptionStyle, type Caption } from '../shared/captions';
import type { Project } from '../shared/project';
import type { TextRun } from '../shared/rich-text';
import { snapCaptionRect, type CaptionSnapTarget, type CaptionSnapAnchor, type CaptionSnapResult } from '../shared/caption-snap';
import { CaptionSnapGuides } from './CaptionSnapGuides';

type Props = { project: Project; frame: number; selected?: string; disabled: boolean; snap: boolean;
  onSelect(id: string): void; onStyle(id: string, patch: Partial<CaptionStyle>): void; onResize(id: string, size: number, runs: TextRun[]): void; onBegin(): void; onEnd(cancelled?: boolean): void; onError(message: string): void };
function CaptionObject({ caption, span, ...props }: Props & { caption: Caption; span: CaptionSpan }) {
  const { project, disabled, selected, onSelect, onStyle, onBegin, onEnd } = props;
  const style = effectiveStyle(project, caption), settings = project.settings;
  const [bitmap, setBitmap] = useState<CaptionBitmap>();
  const [rasterSize, setRasterSize] = useState(style.size);
  const [dragging, setDragging] = useState(false), [snapResult, setSnapResult] = useState<CaptionSnapResult>();
  const element = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ pointerId: number; x: number; y: number; left: number; top: number; width: number; height: number; scale: number; size: number; style: CaptionStyle; runs: TextRun[]; resize: boolean; changed: boolean; targets: CaptionSnapTarget[]; anchors: CaptionSnapAnchor[] } | null>(null);
  const latest = useRef(props); latest.current = props;
  const renderKey = JSON.stringify({ text: caption.text, runs: caption.runs, style: { ...style, position: undefined, motion: undefined }, width: settings.width, height: settings.height });
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => { void window.editor.captionBitmap({ text: caption.text, runs: caption.runs, style, width: settings.width, height: settings.height }).then(b => { if (live) { setBitmap(b); setRasterSize(style.size); } }).catch(e => { if (live) props.onError(`자막 표시 실패: ${String(e)}`); }); }, 60);
    return () => { live = false; clearTimeout(timer); };
  }, [renderKey]);
  function finish(cancelled = false) {
    const g = gesture.current; if (!g) return; gesture.current = null; setDragging(false); setSnapResult(undefined);
    if (element.current?.hasPointerCapture(g.pointerId)) element.current.releasePointerCapture(g.pointerId);
    latest.current.onEnd(cancelled);
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && gesture.current) { e.preventDefault(); e.stopImmediatePropagation(); finish(true); } };
    const blur = () => finish(true);
    window.addEventListener('keydown', key, true); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', key, true); window.removeEventListener('blur', blur); };
  }, []);
  if (!bitmap || !caption.text.trim()) return null;
  const visualBitmap = { width: Math.round(bitmap.width * style.size / rasterSize), height: Math.round(bitmap.height * style.size / rasterSize) };
  const rect = captionRect(visualBitmap, style, settings, project.captionSettings.margins);
  const motion = captionTransform(style.motion, span.start, span.end, props.frame, Math.min(settings.width, settings.height));
  function start(e: PointerEvent, resize: boolean) {
    if (disabled || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const node = element.current!, canvas = node.parentElement!.getBoundingClientRect();
    const scale = canvas.width / settings.width;
    const targets = Array.from(node.parentElement!.querySelectorAll<HTMLElement>('.caption-object[data-caption-id]')).filter(other => other !== node).map(other => {
      const box = other.getBoundingClientRect();
      return { id: other.dataset.captionId!, left: (box.left - canvas.left) / scale, top: (box.top - canvas.top) / scale, width: box.width / scale, height: box.height / scale };
    }).filter(target => target.left < settings.width && target.top < settings.height && target.left + target.width > 0 && target.top + target.height > 0);
    const anchors = ([0, .5, 1] as const).map(anchor => ({ anchor, ...captionRect(visualBitmap, { ...style, position: { h: anchor, v: anchor, x: null, y: null } }, settings, project.captionSettings.margins) }));
    node.focus(); onSelect(caption.id); onBegin();
    gesture.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, left: rect.left, top: rect.top, width: rect.width, height: rect.height, scale, size: style.size, style, runs: caption.runs, resize, changed: false, targets, anchors };
    node.setPointerCapture(e.pointerId); setDragging(true);
  }
  function move(e: PointerEvent) {
    const g = gesture.current; if (!g || g.pointerId !== e.pointerId) return;
    if (!g.changed && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 3) return;
    g.changed = true;
    const dx = (e.clientX - g.x) / g.scale, dy = (e.clientY - g.y) / g.scale;
    if (g.resize) {
      const ratio = Math.max(.1, (g.width + dx) / g.width), size = Math.max(16, Math.min(200, Math.round(g.size * ratio)));
      const runs = g.runs.map(r => r.style.size === undefined ? r : { ...r, style: { ...r.style, size: Math.max(16, Math.min(200, r.style.size * size / g.size)) } });
      props.onResize(caption.id, size, runs); return;
    }
    const raw = { left: g.left + dx, top: g.top + dy, width: g.width, height: g.height };
    const result = props.snap && !e.altKey ? snapCaptionRect(raw, g.targets, g.anchors, settings, g.scale) : undefined;
    const { left, top } = result?.rect ?? raw, h = result?.h ?? g.style.position.h, v = result?.v ?? g.style.position.v;
    const position: CaptionStyle['position'] = { h, v,
      x: result?.h !== undefined ? null : Math.max(-2, Math.min(3, (left + g.width * h) / settings.width)),
      y: result?.v !== undefined ? null : Math.max(-2, Math.min(3, (top + g.height * v) / settings.height)) };
    setSnapResult(result); onStyle(caption.id, { position });
  }
  return <>
    {dragging && gesture.current && !gesture.current.resize && <CaptionSnapGuides result={snapResult} targets={gesture.current.targets} width={settings.width} height={settings.height} scale={gesture.current.scale} enabled={props.snap} />}
    <div ref={element} role="button" tabIndex={disabled ? -1 : 0} aria-label={`화면 자막 ${caption.text}`} data-testid="caption-object" data-caption-id={caption.id} className={`caption-object ${selected === caption.id ? 'selected' : ''} ${rect.overflow ? 'overflow' : ''}`} style={{ left: `${rect.left / settings.width * 100}%`, top: `${rect.top / settings.height * 100}%`, width: `${rect.width / settings.width * 100}%`, height: `${rect.height / settings.height * 100}%` }}
      onPointerDown={e => start(e, false)} onPointerMove={move} onPointerUp={e => { if (gesture.current) { move(e); finish(); } }} onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish(true)}
      onKeyDown={e => { if (disabled) return; const d = e.shiftKey ? 10 : 1; if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); onStyle(caption.id, { position: { ...style.position, x: (rect.left + rect.width * style.position.h + (e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0)) / settings.width, y: (rect.top + rect.height * style.position.v + (e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0)) / settings.height } }); } else if (e.key === 'Enter') onSelect(caption.id); }}>
      <img src={bitmap.url} draggable={false} alt="" style={{ opacity: motion.alpha, transform: `translate(${motion.x / rect.width * 100}%, ${motion.y / rect.height * 100}%) scale(${motion.scale})` }} />
      {selected === caption.id && <button className="caption-resize" tabIndex={-1} aria-label="화면 자막 크기 조절" onPointerDown={e => start(e, true)} />}
      {rect.overflow && selected === caption.id && <span className="caption-overflow-note">화면 밖 · 위치나 크기를 조절하세요</span>}
    </div>
  </>;
}
export function CaptionOverlay(props: Props) {
  return <>{activeCaptionSpans(props.project, props.frame).map(s => <CaptionObject key={s.caption.id} {...props} caption={s.caption} span={s} />)}</>;
}
