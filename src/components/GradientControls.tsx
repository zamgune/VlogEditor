import { gradientCss, type Gradient } from '../shared/decoration';
import { NumericInput } from './NumericInput';
export function GradientControls({ value, color, disabled, onChange }: { value: Gradient | null; color: string; disabled: boolean; onChange(value: Gradient | null): void }) {
  return <div className="gradient-controls">
    <label className="caption-check"><input aria-label="배경 그라데이션 사용" type="checkbox" checked={!!value} disabled={disabled} onChange={e => onChange(e.target.checked ? { angle: 90, from: color, to: '#a6dcca' } : null)} />배경 그라데이션</label>
    {value && <><label>스타일<select aria-label="그라데이션 스타일" value={value.mode ?? 'soft'} disabled={disabled} onChange={e => onChange({ ...value, mode: e.target.value as Gradient['mode'] })}><option value="soft">소프트 · 부드럽게</option><option value="hard">하드 · 두 색 분리</option></select></label>
      <div className="gradient-swatch" style={{ background: gradientCss(value) }} />
      <p className="hint">{value.mode === 'hard' ? '중앙 경계에서 두 색이 선명하게 나뉩니다. 각도로 나누는 방향을 조절하세요.' : '시작 색에서 끝 색으로 부드럽게 이어집니다.'}</p>
      <label>시작 색<input type="color" aria-label="그라데이션 시작 색상" value={value.from} disabled={disabled} onChange={e => onChange({ ...value, from: e.target.value })} /></label>
      <label>끝 색<input type="color" aria-label="그라데이션 끝 색상" value={value.to} disabled={disabled} onChange={e => onChange({ ...value, to: e.target.value })} /></label>
      <label>각도 (°)<NumericInput label="그라데이션 각도" value={value.angle} min={0} max={360} disabled={disabled} onCommit={angle => onChange({ ...value, angle })} /></label>
      <div className="caption-object-actions"><button disabled={disabled} onClick={() => onChange({ ...value, angle: 90 })}>가로 방향</button><button disabled={disabled} onClick={() => onChange({ ...value, angle: 180 })}>세로 방향</button><button disabled={disabled} onClick={() => onChange({ ...value, from: '#ffe3ab', to: '#ef96b2' })}>노을 색</button><button disabled={disabled} onClick={() => onChange({ ...value, from: value.to, to: value.from })}>색 순서 바꾸기</button></div>
    </>}
  </div>;
}
