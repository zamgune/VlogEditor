import { useRef, useState } from 'react';
import { CAPTION_FONTS, captionFontWeight, formatTextRange, textStyleAt, type TextRun, type TextStyle } from '../shared/rich-text';
import type { Caption, CaptionStyle } from '../shared/captions';
import { NumericInput } from './NumericInput';

export function RichTextEditor({ caption, style, disabled, onText, onRuns, onBegin, onEnd }: {
  caption: Caption; style: CaptionStyle; disabled: boolean; onText(text: string): void; onRuns(runs: TextRun[]): void; onBegin(): void; onEnd(cancelled?: boolean): void;
}) {
  const editor = useRef<HTMLTextAreaElement>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const start = Math.min(selection.start, caption.text.length), end = Math.min(selection.end, caption.text.length);
  const selected = end > start, current = { ...style, ...textStyleAt(caption.runs, start) };
  const format = (patch: TextStyle | null) => onRuns(formatTextRange(caption.text, caption.runs, start, end, patch));
  const resize = (size: number) => format({ size });
  const cuts = [...new Set([0, caption.text.length, ...caption.runs.flatMap(r => [r.start, r.end])])].sort((a, b) => a - b);
  return <section className="rich-text-editor" aria-label="문구와 부분 서식">
    <p className="hint">아래 문구에서 바꿀 부분을 드래그로 선택한 뒤 글꼴·크기·색을 바꾸세요.</p>
    <textarea ref={editor} aria-label="부분 서식 문구" rows={4} maxLength={2000} value={caption.text} disabled={disabled} onFocus={onBegin} onBlur={() => onEnd()}
      onChange={e => onText(e.target.value)} onSelect={e => setSelection({ start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd })} />
    <button disabled={disabled || !caption.text.length} onClick={() => { editor.current?.focus(); editor.current?.select(); setSelection({ start: 0, end: caption.text.length }); }}>문구 전체 선택</button>
    <p className="rich-selection" role="status">{selected ? `선택: “${caption.text.slice(start, end)}”` : '서식을 바꿀 글자를 선택하세요.'}</p>
    <label>선택 글꼴<select aria-label="선택 글자 글꼴" value={current.font} disabled={disabled || !selected} onChange={e => { const font = e.target.value as CaptionStyle['font']; format({ font, weight: captionFontWeight(font, current.weight) }); }}>{Object.entries(CAPTION_FONTS).map(([key, font]) => <option key={key} value={key}>{font.label}</option>)}</select></label>
    <div className="caption-number"><label htmlFor="rich-text-size">선택 크기</label><div>
      <input type="range" aria-label="선택 글자 크기 슬라이더" min={16} max={200} step={1} value={current.size} disabled={disabled || !selected} onFocus={onBegin} onBlur={() => onEnd()} onPointerDown={onBegin} onPointerUp={() => onEnd()} onChange={e => resize(e.target.valueAsNumber)} />
      <NumericInput key={`${caption.id}-${start}-${end}-size`} id="rich-text-size" label="선택 글자 크기" min={16} max={200} step={1} value={current.size} disabled={disabled || !selected} onBegin={onBegin} onEnd={onEnd} onPreview={resize} onCommit={resize} />
    </div></div>
    <label>선택 굵기<select aria-label="선택 글자 굵기" value={captionFontWeight(current.font, current.weight)} disabled={disabled || !selected} onChange={e => format({ weight: Number(e.target.value) })}>{CAPTION_FONTS[current.font].weights.map(weight => <option key={weight}>{weight}</option>)}</select></label>
    <label>선택 색<input type="color" aria-label="선택 글자 색상" value={current.color} disabled={disabled || !selected} onChange={e => format({ color: e.target.value })} /></label>
    <div className="caption-object-actions"><button disabled={disabled || !selected} onClick={() => format(null)}>선택 부분 기본값</button><button disabled={disabled || !caption.runs.length} onClick={() => onRuns([])}>부분 서식 모두 지우기</button></div>
    <div className="rich-text-sample" aria-label="부분 서식 미리보기">{cuts.slice(0, -1).map((a, i) => { const s = { ...style, ...textStyleAt(caption.runs, a) }; return <span key={a} style={{ fontFamily: CAPTION_FONTS[s.font].family, fontSize: s.size / 3, fontWeight: captionFontWeight(s.font, s.weight), color: s.color }}>{caption.text.slice(a, cuts[i + 1])}</span>; })}</div>
    <p className="hint">부분 서식은 이 문구에만 적용됩니다. 글 그룹에 저장하면 부분 글꼴·크기도 함께 보관됩니다.</p>
  </section>;
}
