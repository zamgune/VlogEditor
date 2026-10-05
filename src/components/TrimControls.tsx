import { FPS, timecode, type Clip, type Media } from '../shared/project';
import type { TrimEdge } from '../shared/timeline';

export function TrimControls({ clip, media, sourceFrame, disabled, onChange }: {
  clip: Clip; media: Media; sourceFrame?: number; disabled: boolean;
  onChange(inFrame: number, outFrame: number, edge: TrimEdge): void;
}) {
  const frames = clip.outFrame - clip.inFrame;
  const maximum = media.durationFrames - clip.inFrame;
  const atClip = sourceFrame !== undefined && sourceFrame >= clip.inFrame && sourceFrame < clip.outFrame;
  function secondsInput(input: HTMLInputElement, edge: TrimEdge | 'duration') {
    const seconds = input.valueAsNumber;
    const previous = edge === 'start' ? clip.inFrame : edge === 'end' ? clip.outFrame : frames;
    if (!Number.isFinite(seconds) || seconds < 0 || (edge === 'duration' && seconds === 0)) {
      input.value = (previous / FPS).toFixed(3); return;
    }
    const value = Math.round(seconds * FPS);
    const next = edge === 'start' ? Math.max(0, Math.min(value, clip.outFrame - 1))
      : edge === 'end' ? Math.max(clip.inFrame + 1, Math.min(value, media.durationFrames))
        : Math.max(1, Math.min(value, maximum));
    input.value = (next / FPS).toFixed(3);
    onChange(edge === 'start' ? next : clip.inFrame, edge === 'start' ? clip.outFrame : edge === 'end' ? next : clip.inFrame + next, edge === 'start' ? 'start' : 'end');
  }
  return <div className="property-group trim-controls"><h3>영상 길이 <button disabled={disabled} onClick={() => onChange(0, media.durationFrames, 'start')}>원본 길이로</button></h3>
    <div className="trim-seconds-inputs">
      <label>시작 (초)<input aria-label="영상 시작 (초)" key={`${clip.id}-start-${clip.inFrame}`} type="number" min={0} max={(clip.outFrame - 1) / FPS} step="any" defaultValue={(clip.inFrame / FPS).toFixed(3)} disabled={disabled}
        onBlur={e => secondsInput(e.currentTarget, 'start')} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>
      <label>종료 (초)<input aria-label="영상 종료 (초)" key={`${clip.id}-end-${clip.outFrame}`} type="number" min={(clip.inFrame + 1) / FPS} max={media.durationFrames / FPS} step="any" defaultValue={(clip.outFrame / FPS).toFixed(3)} disabled={disabled}
        onBlur={e => secondsInput(e.currentTarget, 'end')} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>
    </div>
    <div className="two-buttons trim-at-playhead">
      <button disabled={disabled || !atClip || sourceFrame === clip.inFrame} title="현재 장면 앞부분을 잘라냅니다" onClick={() => { if (atClip) onChange(sourceFrame, clip.outFrame, 'start'); }}>여기부터 시작</button>
      <button disabled={disabled || !atClip || sourceFrame === clip.outFrame - 1} title="현재 장면까지 남기고 뒷부분을 잘라냅니다" onClick={() => { if (atClip) onChange(clip.inFrame, sourceFrame + 1, 'end'); }}>여기까지 사용</button>
    </div>
    <p className="trim-instruction">시간은 원본 기준입니다. 위쪽 눈금으로 장면을<br />찾고 버튼을 눌러도 됩니다. 왼쪽 손잡이는 앞,<br />오른쪽은 뒤를 자르며 뒤 장면은 이어집니다.</p>
    <label className="duration-control">길이 (초)<input aria-label="영상 길이 (초)" key={`${clip.id}-length-${frames}`} type="number" min={1 / FPS} max={maximum / FPS} step="any" defaultValue={(frames / FPS).toFixed(3)} disabled={disabled}
      onBlur={e => secondsInput(e.currentTarget, 'duration')}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>
    <div className="trim-frame-inputs"><label>시작 프레임<input key={`${clip.id}-in-${clip.inFrame}`} aria-label="시작 프레임" type="number" min={0} max={clip.outFrame - 1} defaultValue={clip.inFrame} disabled={disabled}
      onBlur={e => { const value = e.target.valueAsNumber; if (Number.isInteger(value) && value >= 0 && value < clip.outFrame) onChange(value, clip.outFrame, 'start'); else e.target.value = String(clip.inFrame); }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>
    <label>종료 프레임 (미포함)<input key={`${clip.id}-out-${clip.outFrame}`} aria-label="종료 프레임" type="number" min={clip.inFrame + 1} max={media.durationFrames} defaultValue={clip.outFrame} disabled={disabled}
      onBlur={e => { const value = e.target.valueAsNumber; if (Number.isInteger(value) && value > clip.inFrame && value <= media.durationFrames) onChange(clip.inFrame, value, 'end'); else e.target.value = String(clip.outFrame); }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label></div>
    <p className="range-summary">{timecode(clip.inFrame)} → {timecode(clip.outFrame)}<strong>{frames}프레임 · 원본 {(media.durationFrames / 30).toFixed(2)}초</strong></p>
  </div>;
}
