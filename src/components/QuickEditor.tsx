import { CAPTION_FONTS, captionFontWeight, effectiveStyle, KIND_LABEL, type Caption, type CaptionStyle } from '../shared/captions';
import type { Decoration } from '../shared/decoration';
import type { Project } from '../shared/project';
import { NumericInput } from './NumericInput';

export function QuickEditor({ project, caption, shape, disabled, onText, onStyle, onShape, onBegin, onEnd, onDetails, onGroup, onDuplicate }: {
  project: Project; caption?: Caption; shape?: Decoration; disabled: boolean;
  onText(text: string): void; onStyle(patch: Partial<CaptionStyle>): void; onShape(patch: Partial<Decoration>): void;
  onBegin(): void; onEnd(cancelled?: boolean): void; onDetails(text?: boolean): void; onGroup(): void; onDuplicate(): void;
}) {
  const style = caption ? effectiveStyle(project, caption) : undefined;
  return <div className="quick-editor" aria-label="빠른 편집">
    <h2 className="quick-heading">편집 도구 <span>선택한 글·도형을 편집하세요</span></h2>
    {caption && style ? <>
      <span className="quick-kind">{KIND_LABEL[caption.kind]}</span>
      <textarea aria-label="빠른 문구 편집" rows={1} maxLength={2000} value={caption.text} disabled={disabled} onFocus={onBegin} onBlur={() => onEnd()} onChange={e => onText(e.target.value)} />
      <label>기본 글꼴<select aria-label="빠른 기본 글꼴" value={style.font} disabled={disabled} onChange={e => { const font = e.target.value as CaptionStyle['font']; onStyle({ font, weight: captionFontWeight(font, style.weight) }); }}>{Object.entries(CAPTION_FONTS).map(([id, font]) => <option key={id} value={id}>{font.label}</option>)}</select></label>
      <label>기본 크기<NumericInput label="빠른 글자 크기" value={style.size} min={16} max={200} step={1} disabled={disabled} onBegin={onBegin} onEnd={onEnd} onPreview={size => onStyle({ size })} onCommit={size => onStyle({ size })} /></label>
      <label>글자색<input type="color" aria-label="빠른 글자 색상" value={style.color} disabled={disabled} onChange={e => onStyle({ color: e.target.value })} /></label>
      <button aria-pressed={style.opacity > 0} disabled={disabled} onClick={() => onStyle({ opacity: style.opacity > 0 ? 0 : .85 })}>배경 {style.opacity > 0 ? '켜짐' : '꺼짐'}</button>
      <button disabled={disabled} onClick={() => onDetails(true)}>부분 서식</button>
      <button disabled={disabled || project.captions.length >= 2000} onClick={onDuplicate}>복제</button>
      <button disabled={disabled} onClick={onGroup}>묶음 저장</button>
    </> : shape ? <>
      <span className="quick-kind">{shape.kind === 'rectangle' ? '사각형' : '타원'} · {shape.name}</span>
      <label>색상<input type="color" aria-label="빠른 도형 색상" value={shape.color} disabled={disabled} onChange={e => onShape({ color: e.target.value })} /></label>
      {shape.kind === 'rectangle' && <label>라운드<NumericInput label="빠른 도형 라운드" min={0} max={1000} value={shape.radius} disabled={disabled} onBegin={onBegin} onEnd={onEnd} onPreview={radius => onShape({ radius })} onCommit={radius => onShape({ radius })} /></label>}
      <label>불투명도 %<NumericInput label="빠른 도형 불투명도" min={0} max={100} value={shape.opacity * 100} disabled={disabled} onBegin={onBegin} onEnd={onEnd} onPreview={n => onShape({ opacity: n / 100 })} onCommit={n => onShape({ opacity: n / 100 })} /></label>
      <button disabled={disabled} onClick={onGroup}>묶음 저장</button>
    </> : <span className="quick-empty">화면의 글·도형을 선택해 바로 편집하세요. 영상 구간과 색감은 상세 편집에서 조절합니다.</span>}
    <button className="quick-details" disabled={disabled} onClick={() => onDetails()}>상세 편집</button>
  </div>;
}
