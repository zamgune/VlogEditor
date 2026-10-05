import { ColorSchema, NEUTRAL_COLOR, type Color } from '../shared/color';

const controls: { key: keyof Color; label: string; low: string; high: string }[] = [
  { key: 'brightness', label: '밝기', low: '어둡게', high: '밝게' },
  { key: 'contrast', label: '대비', low: '부드럽게', high: '선명하게' },
  { key: 'saturation', label: '채도', low: '흑백', high: '진하게' },
  { key: 'warmth', label: '따뜻함', low: '차갑게', high: '따뜻하게' }
];
export function ColorControls({ value, disabled, onChange, onBegin, onEnd }: {
  value: Color; disabled: boolean; onChange: (value: Color) => void; onBegin: () => void; onEnd: () => void;
}) {
  return <div className="property-group color-controls"><h3>기본 보정 <button disabled={disabled} onClick={() => onChange({ ...NEUTRAL_COLOR })}>보정 초기화</button></h3>
    {controls.map(({ key, label, low, high }) => <div className="color-control" key={key}>
      <label>{label}<input aria-label={`${label} 값`} type="number" min={-100} max={100} step={1} disabled={disabled}
        key={`${key}-${value[key]}`} defaultValue={value[key]}
        onBlur={e => { const next = { ...value, [key]: Number(e.target.value) }; if (ColorSchema.safeParse(next).success) onChange(next); else e.target.value = String(value[key]); }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>
      <input aria-label={label} type="range" min={-100} max={100} step={1} value={value[key]} disabled={disabled}
        onPointerDown={onBegin} onPointerUp={onEnd} onPointerCancel={onEnd} onBlur={onEnd}
        onChange={e => onChange({ ...value, [key]: Number(e.target.value) })} />
      <div className="color-extents"><span>{low}</span><span>{high}</span></div>
    </div>)}<p className="hint">선택한 클립에 적용 · 출력에도 반영</p>
  </div>;
}
