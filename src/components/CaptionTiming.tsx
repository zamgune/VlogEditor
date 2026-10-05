import { NumericInput } from './NumericInput';
import type { Caption } from '../shared/captions';
import { locate, type Project } from '../shared/project';

export function CaptionTiming({ project, caption, frame, disabled, onRange }: {
  project: Project; caption: Caption; frame: number; disabled: boolean; onRange(start: number, end: number): void;
}) {
  const clip = project.clips.find(c => c.id === caption.clipId);
  if (!clip) return <div className="property-group caption-timing"><h3>표시 시간 · 영상 전체</h3><p className="hint">장면 안에서 시간을 나눌 때는 일반 자막이나 강조 캡션을 사용하세요. 제목 디자인도 적용할 수 있습니다.</p></div>;
  const start = Math.max(clip.inFrame, caption.inFrame), end = Math.min(clip.outFrame, caption.outFrame);
  const length = end - start, clipLength = clip.outFrame - clip.inFrame;
  const at = locate(project, frame), canMove = at?.clip.id === clip.id;
  const normalize = (n: number) => Math.round(n * 30) / 30;
  return <section className="property-group caption-timing" aria-label="자막 표시 시간">
    <h3>표시 시간 <small>이 장면 기준</small></h3>
    <div className="caption-time-fields">
      <label>시작 (초)<NumericInput key={`${caption.id}-start`} label="자막 시작 초" value={(start - clip.inFrame) / 30} min={0} max={(end - clip.inFrame - 1) / 30} step={1 / 30} normalize={normalize} disabled={disabled} onCommit={n => onRange(clip.inFrame + Math.round(n * 30), end)} /></label>
      <label>끝 (초)<NumericInput key={`${caption.id}-end`} label="자막 끝 초" value={(end - clip.inFrame) / 30} min={(start - clip.inFrame + 1) / 30} max={clipLength / 30} step={1 / 30} normalize={normalize} disabled={disabled} onCommit={n => onRange(start, clip.inFrame + Math.round(n * 30))} /></label>
    </div>
    <label>길이 (초)<NumericInput key={`${caption.id}-length`} label="자막 길이 초" value={length / 30} min={1 / 30} max={(clip.outFrame - start) / 30} step={1 / 30} normalize={normalize} disabled={disabled} onCommit={n => onRange(start, start + Math.round(n * 30))} /></label>
    <div className="caption-object-actions">
      <button disabled={disabled || !canMove} title="길이를 유지해 재생 위치로 옮깁니다. 장면 끝을 넘으면 끝에 맞춥니다." onClick={() => { if (!canMove || !at) return; const a = Math.min(at.sourceFrame, clip.outFrame - length); onRange(a, a + length); }}>현재 위치로 이동</button>
      <button disabled={disabled || length === clipLength} onClick={() => onRange(clip.inFrame, clip.outFrame)}>장면 전체</button>
    </div>
    <p className="hint">선택한 자막만 바뀝니다. 타임라인 가운데를 끌면 시간 이동, 양끝을 끌면 길이 조절입니다. 같은 구간에 여러 자막을 겹칠 수 있습니다.{length === clipLength && ' 이동하려면 먼저 길이를 줄여 주세요.'}</p>
  </section>;
}
