import { useEffect, useRef, type PointerEvent } from 'react';
import { activeDecorations, decorationGeometry, type Decoration } from '../shared/decoration';
import type { Project } from '../shared/project';

type Props = { project: Project; frame: number; selected?: string; disabled: boolean; onSelect(id: string): void; onChange(id: string, patch: Partial<Decoration>): void; onBegin(): void; onEnd(cancelled?: boolean): void };
function ShapeObject({ shape, ...props }: Props & { shape: Decoration }) {
  const element = useRef<HTMLDivElement>(null), drag = useRef<{ x: number; y: number; w: number; h: number; shape: Decoration; resize: boolean; pointer: number } | null>(null);
  const latest = useRef(props); latest.current = props;
  const g = decorationGeometry(shape, props.project.settings.width, props.project.settings.height), inset = g.stroke / 2;
  function finish(cancelled = false) { const d = drag.current; if (!d) return; drag.current = null; if (element.current?.hasPointerCapture(d.pointer)) element.current.releasePointerCapture(d.pointer); latest.current.onEnd(cancelled); }
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && drag.current) { e.preventDefault(); e.stopImmediatePropagation(); finish(true); } }, blur = () => finish(true);
    window.addEventListener('keydown', key, true); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', key, true); window.removeEventListener('blur', blur); };
  }, []);
  function start(e: PointerEvent, resize = false) {
    if (props.disabled || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation(); const node = element.current!, bounds = node.parentElement!.getBoundingClientRect();
    node.focus(); props.onSelect(shape.id); props.onBegin(); drag.current = { x: e.clientX, y: e.clientY, w: bounds.width, h: bounds.height, shape, resize, pointer: e.pointerId }; node.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    const d = drag.current; if (!d || d.pointer !== e.pointerId) return;
    const dx = (e.clientX - d.x) / d.w, dy = (e.clientY - d.y) / d.h;
    if (!dx && !dy) return;
    props.onChange(shape.id, d.resize ? { width: Math.max(.01, Math.min(2, d.shape.width + dx)), height: Math.max(.01, Math.min(2, d.shape.height + dy)) } : { x: Math.max(-1, Math.min(1, d.shape.x + dx)), y: Math.max(-1, Math.min(1, d.shape.y + dy)) });
  }
  return <div ref={element} role="button" tabIndex={props.disabled ? -1 : 0} aria-label={`화면 도형 ${shape.name}`} data-testid="decoration-object" data-shape-id={shape.id} className={`decoration-object ${props.selected === shape.id ? 'selected' : ''}`} style={{ left: `${shape.x * 100}%`, top: `${shape.y * 100}%`, width: `${shape.width * 100}%`, height: `${shape.height * 100}%`, zIndex: shape.layer === 'front' ? 4 : 2 }}
    onPointerDown={e => start(e)} onPointerMove={move} onPointerUp={e => { if (drag.current) { move(e); finish(); } }} onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish(true)} onKeyDown={e => {
      if (props.disabled) return;
      if (e.key === 'Enter') props.onSelect(shape.id);
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); const step = e.shiftKey ? 10 : 1; props.onChange(shape.id, { x: Math.max(-1, Math.min(1, shape.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0) / props.project.settings.width)), y: Math.max(-1, Math.min(1, shape.y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0) / props.project.settings.height)) }); }
    }}>
    <svg viewBox={`0 0 ${g.width} ${g.height}`} width="100%" height="100%" aria-hidden="true" style={{ opacity: shape.opacity }}>
      {shape.kind === 'ellipse' ? <ellipse cx={g.width / 2} cy={g.height / 2} rx={Math.max(0, g.width / 2 - inset)} ry={Math.max(0, g.height / 2 - inset)} fill={shape.color} stroke={shape.strokeColor} strokeWidth={g.stroke} /> : <rect x={inset} y={inset} width={Math.max(0, g.width - g.stroke)} height={Math.max(0, g.height - g.stroke)} rx={Math.max(0, g.radius - inset)} fill={shape.color} stroke={shape.strokeColor} strokeWidth={g.stroke} />}
    </svg>
    {props.selected === shape.id && <button className="caption-resize" aria-label="화면 도형 크기 조절" tabIndex={-1} onPointerDown={e => start(e, true)} />}
  </div>;
}
export function DecorationOverlay(props: Props) { return <>{activeDecorations(props.project, props.frame).map(shape => <ShapeObject key={shape.id} {...props} shape={shape} />)}</>; }
