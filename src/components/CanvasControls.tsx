import { CANVAS_PRESETS, canvasPreset, type CanvasSettings, type Framing } from '../shared/canvas';

export function CanvasControls({ settings, disabled, onChange }: { settings: CanvasSettings; disabled: boolean; onChange(settings: CanvasSettings): void }) {
  return <div className="canvas-controls" aria-label="프로젝트 화면 설정">
    <label>화면 비율 <select aria-label="프로젝트 화면 비율" disabled={disabled} value={canvasPreset(settings).id} onChange={e => {
      const preset = CANVAS_PRESETS.find(p => p.id === e.target.value)!;
      onChange({ ...settings, width: preset.width, height: preset.height });
    }}>{CANVAS_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
    <label>기본 맞춤 <select aria-label="기본 화면 맞춤" disabled={disabled} value={settings.fit} onChange={e => onChange({ ...settings, fit: e.target.value as CanvasSettings['fit'] })}>
      <option value="contain">전체 보이기 · 여백 허용</option><option value="cover">화면 채우기 · 일부 잘림</option>
    </select></label>
    <div className="background-control"><span>여백 색</span><div>
      <button aria-label="검정 여백" title="검정 여백" disabled={disabled} style={{ background: '#000000' }} onClick={() => onChange({ ...settings, background: '#000000' })} />
      <button aria-label="흰색 여백" title="흰색 여백" disabled={disabled} style={{ background: '#ffffff' }} onClick={() => onChange({ ...settings, background: '#ffffff' })} />
      <input type="color" aria-label="여백 색상" title="직접 여백 색 고르기" disabled={disabled} value={settings.background} onChange={e => onChange({ ...settings, background: e.target.value })} />
    </div></div>
    <span className="canvas-scope">프로젝트 기본 설정</span>
  </div>;
}

export function FramingControls({ framing, settings, disabled, onChange, onBegin, onEnd }: { framing: Framing; settings: CanvasSettings; disabled: boolean; onChange(framing: Framing): void; onBegin(): void; onEnd(): void }) {
  const fit = framing.fit === 'inherit' ? settings.fit : framing.fit;
  return <div className="property-group framing-controls"><h3>화면 맞춤 <small>선택한 영상</small></h3>
    <select aria-label="선택 영상 화면 맞춤" disabled={disabled} value={framing.fit} onChange={e => onChange({ ...framing, fit: e.target.value as Framing['fit'] })}>
      <option value="inherit">프로젝트 설정 따름</option><option value="contain">전체 보이기 · 여백 허용</option><option value="cover">화면 채우기 · 일부 잘림</option>
    </select>
    <p className="framing-hint">{fit === 'contain' ? '영상을 자르지 않고 전체를 보여줍니다. 남는 공간에는 여백 색이 적용됩니다.' : '화면에 꽉 차게 맞춥니다. 잘리는 방향의 위치를 조절해 원하는 장면을 남기세요.'}</p>
    {fit === 'cover' && <>
      <label>가로 위치 <span>{framing.x}%</span></label>
      <input aria-label="채우기 가로 위치" type="range" min="0" max="100" value={framing.x} disabled={disabled} onPointerDown={onBegin} onPointerUp={onEnd} onPointerCancel={onEnd} onBlur={onEnd} onChange={e => onChange({ ...framing, x: Number(e.target.value) })} />
      <div className="color-extents"><span>왼쪽</span><span>오른쪽</span></div>
      <label>세로 위치 <span>{framing.y}%</span></label>
      <input aria-label="채우기 세로 위치" type="range" min="0" max="100" value={framing.y} disabled={disabled} onPointerDown={onBegin} onPointerUp={onEnd} onPointerCancel={onEnd} onBlur={onEnd} onChange={e => onChange({ ...framing, y: Number(e.target.value) })} />
      <div className="color-extents"><span>위쪽</span><span>아래쪽</span></div>
      <button disabled={disabled} className="center-framing" onClick={() => onChange({ ...framing, x: 50, y: 50 })}>가운데로</button>
    </>}
  </div>;
}
