import { NumericInput } from './NumericInput';
import { decorationSpans, type Decoration } from '../shared/decoration';
import { timecode, type Project } from '../shared/project';

export function DecorationList({ project, selected, disabled, onAdd, onSelect }: { project: Project; selected?: string; disabled: boolean; onAdd(kind: Decoration['kind']): void; onSelect(id: string): void }) {
  return <div className="decoration-list"><div className="caption-object-actions"><button disabled={disabled || !project.clips.length || project.decorations.length >= 500} onClick={() => onAdd('rectangle')}>＋ 사각형</button><button disabled={disabled || !project.clips.length || project.decorations.length >= 500} onClick={() => onAdd('ellipse')}>＋ 타원</button></div><p className="hint">도형을 추가하고 화면에서 끌어 위치를 바꾸세요. 모서리를 끌면 크기가 바뀝니다.</p>
    {decorationSpans(project).map(s => <button key={s.shape.id} data-testid="decoration-list-item" data-shape-id={s.shape.id} aria-pressed={selected === s.shape.id} disabled={disabled} onClick={() => onSelect(s.shape.id)}><strong>{s.shape.kind === 'rectangle' ? '▰' : '●'} {s.shape.name}</strong><small>{timecode(s.start)} → {timecode(s.end)}</small></button>)}
  </div>;
}
export function DecorationControls({ project, shape, disabled, onChange, onDelete, onDuplicate, onOrder }: { project: Project; shape: Decoration; disabled: boolean; onChange(patch: Partial<Decoration>): void; onDelete(): void; onDuplicate(): void; onOrder(direction: 'front' | 'back'): void }) {
  const clip = project.clips.find(c => c.id === shape.clipId);
  const start = clip ? Math.max(clip.inFrame, shape.inFrame) : 0, end = clip ? Math.min(clip.outFrame, shape.outFrame) : 0;
  const number = (key: 'x' | 'y' | 'width' | 'height' | 'opacity' | 'radius' | 'stroke', label: string, min: number, max: number, factor = 1) => <label>{label}<NumericInput key={`${shape.id}-${key}`} label={`도형 ${label}`} value={shape[key] * factor} min={min} max={max} disabled={disabled} onCommit={value => onChange({ [key]: value / factor })} /></label>;
  return <div className="caption-controls decoration-controls"><h2>도형 꾸미기</h2><div className="caption-object-actions"><button aria-label="도형 복제" disabled={disabled || project.decorations.length >= 500} onClick={onDuplicate}>복제</button><button aria-label="도형 삭제" disabled={disabled} onClick={onDelete}>삭제</button></div>
    <label>이름<input key={`${shape.id}-${shape.name}`} aria-label="도형 이름" type="text" maxLength={80} defaultValue={shape.name} disabled={disabled} onBlur={e => { const name = e.target.value.trim() || shape.name; e.target.value = name; if (name !== shape.name) onChange({ name }); }} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = shape.name; e.currentTarget.blur(); } }} /></label>
    <div className="property-group"><h3>모양과 색</h3><label>모양<select aria-label="도형 종류" value={shape.kind} disabled={disabled} onChange={e => onChange({ kind: e.target.value as Decoration['kind'] })}><option value="rectangle">사각형</option><option value="ellipse">타원</option></select></label>
      <label>채우기 색<input aria-label="도형 색상" type="color" value={shape.color} disabled={disabled} onChange={e => onChange({ color: e.target.value })} /></label>{number('opacity', '불투명도 (%)', 0, 100, 100)}{shape.kind === 'rectangle' && number('radius', '둥글기', 0, 1000)}{number('stroke', '테두리 두께', 0, 40)}
      <label>테두리 색<input aria-label="도형 테두리 색상" type="color" value={shape.strokeColor} disabled={disabled} onChange={e => onChange({ strokeColor: e.target.value })} /></label>
    </div>
    <div className="property-group"><h3>위치와 크기</h3>{number('x', '가로 위치 (%)', -100, 100, 100)}{number('y', '세로 위치 (%)', -100, 100, 100)}{number('width', '너비 (%)', 1, 200, 100)}{number('height', '높이 (%)', 1, 200, 100)}<button disabled={disabled} onClick={() => onChange({ x: (1 - shape.width) / 2, y: (1 - shape.height) / 2 })}>화면 가운데로</button></div>
    <div className="property-group"><h3>겹치는 순서</h3><label>글과의 순서<select aria-label="도형 글과의 순서" value={shape.layer} disabled={disabled} onChange={e => onChange({ layer: e.target.value as Decoration['layer'] })}><option value="behind">자막 뒤</option><option value="front">자막 앞</option></select></label><div className="caption-object-actions"><button disabled={disabled} aria-label="도형 맨 앞으로" onClick={() => onOrder('front')}>맨 앞으로</button><button disabled={disabled} aria-label="도형 맨 뒤로" onClick={() => onOrder('back')}>맨 뒤로</button></div></div>
    <div className="property-group"><h3>표시 시간 · 이 장면 기준</h3>{clip ? <>
      <label>시작 (초)<NumericInput key={`${shape.id}-start`} label="도형 시작 초" value={(start - clip.inFrame) / 30} min={0} max={(end - clip.inFrame - 1) / 30} step={1 / 30} disabled={disabled} normalize={n => Math.round(n * 30) / 30} onCommit={n => onChange({ inFrame: clip.inFrame + Math.round(n * 30), outFrame: end })} /></label>
      <label>끝 (초)<NumericInput key={`${shape.id}-end`} label="도형 끝 초" value={(end - clip.inFrame) / 30} min={(start - clip.inFrame + 1) / 30} max={(clip.outFrame - clip.inFrame) / 30} step={1 / 30} disabled={disabled} normalize={n => Math.round(n * 30) / 30} onCommit={n => onChange({ inFrame: start, outFrame: clip.inFrame + Math.round(n * 30) })} /></label>
      <button disabled={disabled} onClick={() => onChange({ inFrame: clip.inFrame, outFrame: clip.outFrame })}>장면 전체에 표시</button>
    </> : <p>영상 전체</p>}</div>
  </div>;
}
