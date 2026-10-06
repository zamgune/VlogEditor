import { useState } from 'react';
import { CustomDeviceSchema, DEFAULT_SHORTS, DEFAULT_VIDEO, DEVICE_PRESETS, type ViewSettings } from '../shared/viewer';
import { NumericInput } from './NumericInput';

export function ViewerControls({ view, onChange, disabled }: { view: ViewSettings; onChange(patch: Partial<ViewSettings>): void; disabled: boolean }) {
  const [settings, setSettings] = useState(false), [custom, setCustom] = useState(false);
  const [name, setName] = useState('내 기기'), [width, setWidth] = useState(1080), [height, setHeight] = useState(2400);
  const device = [...DEVICE_PRESETS, ...view.customDevices].find(d => d.id === view.deviceId)!;
  const margins = view[view.platform];
  return <div className="viewer-controls">
    <div className="viewer-toolbar" aria-label="기기 미리보기 설정">
      <select aria-label="미리보기 방식" value={view.mode} disabled={disabled} onChange={e => onChange({ mode: e.target.value as ViewSettings['mode'] })}><option value="original">원본 보기</option><option value="device">기기에서 보기</option></select>
      {view.mode === 'device' && <>
        <select aria-label="미리보기 기기" value={view.deviceId} disabled={disabled} onChange={e => { if (e.target.value === 'custom') { setCustom(true); setSettings(true); } else onChange({ deviceId: e.target.value }); }}>
          {[...DEVICE_PRESETS, ...view.customDevices].map(d => <option key={d.id} value={d.id}>{d.name}</option>)}<option value="custom">＋ 사용자 지정</option>
        </select>
        <select aria-label="기기 방향" value={view.orientation} disabled={disabled} onChange={e => onChange({ orientation: e.target.value as ViewSettings['orientation'] })}><option value="portrait">세로</option><option value="landscape">가로</option></select>
        <select aria-label="유튜브 보기" value={view.platform} disabled={disabled} onChange={e => onChange({ platform: e.target.value as ViewSettings['platform'] })}><option value="shorts">YouTube 쇼츠</option><option value="video">YouTube 일반 영상</option></select>
        <select aria-label="기기 화면 맞춤" value={view.fit} disabled={disabled} onChange={e => onChange({ fit: e.target.value as ViewSettings['fit'] })}><option value="contain">영상 전체 보기</option><option value="cover">화면 채우기</option></select>
        <button aria-pressed={view.guides} disabled={disabled} onClick={() => onChange({ guides: !view.guides })}>안전 영역 {view.guides ? '켜짐' : '꺼짐'}</button>
        <button aria-expanded={settings} disabled={disabled} onClick={() => setSettings(v => !v)}>가이드 설정</button>
      </>}
    </div>
    {view.mode === 'device' && <div className="viewer-note"><span>{view.orientation === 'portrait' ? `${device.width} × ${device.height}` : `${device.height} × ${device.width}`} · 예상 보기</span><span>빗금: 가려질 수 있는 곳 · 출력 영상에는 포함되지 않음</span></div>}
    {view.mode === 'device' && settings && <section className="viewer-settings" aria-label="가이드 상세 설정">
      <div className="viewer-settings-heading"><strong>예상 가림 영역 조정</strong><button onClick={() => setSettings(false)} aria-label="가이드 설정 닫기">닫기</button></div>
      <p>유튜브 앱과 표시 상태에 따라 달라지는 참고용 여백입니다. 펼친 댓글창·광고 팝업·기기 카메라 구멍의 정확한 모양은 재현하지 않습니다.</p>
      {view.platform === 'video' && <label className="viewer-check"><input type="checkbox" checked={view.controls} disabled={disabled} onChange={e => onChange({ controls: e.target.checked })} />재생 조작부 보임</label>}
      <div className="viewer-margin-fields">{(['top', 'bottom', 'left', 'right'] as const).map((key, i) => <label key={key}>{['상단', '하단', '왼쪽', '오른쪽'][i]} %<NumericInput label={`가이드 ${key} 여백`} min={0} max={45} value={margins[key] * 100} disabled={disabled || (view.platform === 'video' && !view.controls)} onCommit={n => onChange({ [view.platform]: { ...margins, [key]: n / 100 } })} /></label>)}</div>
      <div className="viewer-banner"><label className="viewer-check"><input type="checkbox" checked={view.banner} disabled={disabled} onChange={e => onChange({ banner: e.target.checked })} />하단 배너 고려</label>{view.banner && <label>높이 % <NumericInput label="하단 배너 높이" min={0} max={45} value={view.bannerHeight * 100} disabled={disabled} onCommit={n => onChange({ bannerHeight: n / 100 })} /></label>}<button disabled={disabled} onClick={() => onChange({ [view.platform]: { ...(view.platform === 'shorts' ? DEFAULT_SHORTS : DEFAULT_VIDEO) }, banner: false, bannerHeight: .15, controls: true })}>가이드 기본값</button></div>
      <button disabled={disabled} aria-expanded={custom} onClick={() => setCustom(v => !v)}>사용자 지정 기기</button>
      {custom && <div className="custom-device"><label>이름<input aria-label="사용자 기기 이름" maxLength={40} value={name} disabled={disabled} onChange={e => setName(e.target.value)} /></label><label>너비<NumericInput label="사용자 기기 너비" value={width} min={240} max={10000} normalize={Math.round} disabled={disabled} onCommit={setWidth} /></label><label>높이<NumericInput label="사용자 기기 높이" value={height} min={240} max={10000} normalize={Math.round} disabled={disabled} onCommit={setHeight} /></label><button disabled={disabled || !name.trim() || view.customDevices.length >= 20} onClick={() => { const d = CustomDeviceSchema.parse({ id: crypto.randomUUID(), name, width, height }); onChange({ customDevices: [...view.customDevices, d], deviceId: d.id }); setCustom(false); }}>기기 저장</button>{view.customDevices.some(d => d.id === view.deviceId) && <button disabled={disabled} onClick={() => onChange({ deviceId: 'galaxys25', customDevices: view.customDevices.filter(d => d.id !== view.deviceId) })}>선택한 사용자 기기 삭제</button>}</div>}
    </section>}
  </div>;
}
