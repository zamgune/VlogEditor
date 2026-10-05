import { memo, useEffect, useMemo, useState } from 'react';
import { CAPTION_FONTS, captionFontWeight, CAPTION_PRESETS, PRESET_CATEGORIES, KIND_LABEL, effectiveStyle, captionSpans, emptyCaptionLibrary, presetPatch, type Caption, type CaptionStyle, type CaptionLibrary, type CaptionMotion } from '../shared/captions';
import { renderCaption } from '../shared/caption-renderer';
import { timecode, type Project } from '../shared/project';

export const CaptionList = memo(function CaptionList({ project, selected, disabled, onSelect, onText, onBegin, onEnd }: {
  project: Project; selected?: string; disabled: boolean; onSelect(id: string): void; onText(id: string, text: string): void; onBegin(): void; onEnd(): void;
}) {
  const spans = captionSpans(project);
  return <div className="caption-list">{project.captions.length ? spans.sort((a, b) => a.start - b.start || b.caption.zOrder - a.caption.zOrder).map(s => <div key={s.caption.id} className={`caption-list-item ${selected === s.caption.id ? 'selected' : ''}`}>
    <button disabled={disabled} onClick={() => onSelect(s.caption.id)}><span>{KIND_LABEL[s.caption.kind]}</span><small>{timecode(s.start)} → {timecode(s.end)}</small></button>
    <textarea aria-label={`자막 문장 ${s.caption.id}`} value={s.caption.text} maxLength={2000} disabled={disabled} rows={2} onFocus={() => { onSelect(s.caption.id); onBegin(); }} onChange={e => onText(s.caption.id, e.target.value)} onBlur={onEnd} />
  </div>) : <p className="hint">영상을 선택하고 자막을 추가하세요.<br />같은 장면에 여러 자막을 넣을 수 있습니다.</p>}</div>;
}, (a, b) => a.project === b.project && a.selected === b.selected && a.disabled === b.disabled);

type Card = { id: string; name: string; style: CaptionStyle; category: string; savedId?: string };
const PresetCard = memo(function PresetCard({ preset, disabled, favorite, libraryDisabled, onApply, onFavorite }: {
  preset: Card; disabled: boolean; favorite: boolean; libraryDisabled: boolean; onApply(p: Card): void; onFavorite(id: string): void;
}) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let live = true;
    void renderCaption({ text: '오늘의 한 장면', style: { ...preset.style, size: 48, maxWidth: .95 }, width: 600, height: 240 }).then(b => { if (live) setSrc(b.url); }).catch(() => { if (live) setSrc(''); });
    return () => { live = false; };
  }, [preset]);
  return <div className="caption-preset-wrap"><button className="caption-preset" aria-label={`디자인 ${preset.name}`} disabled={disabled} onClick={() => onApply(preset)}><div>{src ? <img src={src} alt="" /> : <span>가나다</span>}</div><span>{preset.name}</span></button>
    <button className="preset-star" aria-label={`${preset.name} 즐겨찾기`} aria-pressed={favorite} disabled={libraryDisabled} onClick={() => onFavorite(preset.id)}>{favorite ? '★' : '☆'}</button></div>;
});

type Props = {
  project: Project; caption: Caption; disabled: boolean;
  onStyle(patch: Partial<CaptionStyle>, common: boolean): void; onRange(a: number, b: number): void; onReset(): void; onAlignAll(): void;
  onBegin(): void; onEnd(): void; onMargins(m: Project['captionSettings']['margins']): void; onError(message: string): void;
  onDuplicate(): void; onDelete(): void; onOrder(direction: -1 | 1): void; onPreview(): void;
};
export function CaptionControls({ project, caption, disabled, onStyle, onRange, onReset, onAlignAll, onBegin, onEnd, onMargins, onError, onDuplicate, onDelete, onOrder, onPreview }: Props) {
  const [common, setCommon] = useState(false), [tab, setTab] = useState<'style' | 'decorate' | 'motion'>('style');
  const [library, setLibrary] = useState<CaptionLibrary>(emptyCaptionLibrary), [loaded, setLoaded] = useState(false), [saving, setSaving] = useState(false);
  const [name, setName] = useState(''), [managed, setManaged] = useState<string>(), [rename, setRename] = useState('');
  const [filter, setFilter] = useState('all'), [category, setCategory] = useState('all'), [query, setQuery] = useState(''), [includeLayout, setIncludeLayout] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => { setCommon(false); }, [caption.id]);
  useEffect(() => { let live = true; void window.editor.captionPresets().then(v => { if (live) { setLibrary(v); setLoaded(true); } }).catch(e => onError(String(e))); return () => { live = false; }; }, []);
  const cards = useMemo<Card[]>(() => [...CAPTION_PRESETS.map(p => ({ ...p, id: `builtin:${p.id}` })), ...library.styles.map(p => ({ ...p, id: `user:${p.id}`, savedId: p.id, category: '내 스타일' }))], [library.styles]);
  const visible = cards.filter(p => (filter !== 'favorites' || library.favorites.includes(p.id)) && (filter !== 'saved' || p.savedId) && (category === 'all' || p.category === category) && p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const style = common ? project.captionSettings[caption.kind] : effectiveStyle(project, caption);
  const clip = project.clips.find(c => c.id === caption.clipId);
  const change = (patch: Partial<CaptionStyle>) => onStyle(patch, common);
  const libraryDisabled = disabled || !loaded || saving;
  const chosen = library.styles.find(s => s.id === managed);
  async function persist(next: CaptionLibrary, message: string) {
    if (libraryDisabled) return;
    setSaving(true); setNotice('');
    try { await window.editor.saveCaptionPresets(next); setLibrary(next); setNotice(message); }
    catch (e) { onError(`스타일 저장 실패: ${String(e)}`); }
    finally { setSaving(false); }
  }
  function apply(p: Card) { change(presetPatch(p.style, includeLayout)); setManaged(p.savedId); setRename(p.name); setNotice(`${p.name} 적용됨`); }
  function favorite(id: string) { void persist({ ...library, favorites: library.favorites.includes(id) ? library.favorites.filter(v => v !== id) : [...library.favorites, id] }, '즐겨찾기를 저장했습니다.'); }
  function saveNew(source: CaptionStyle, label: string) {
    const safeName = label.trim().slice(0, 80); if (!safeName || library.styles.length >= 100) return;
    void persist({ ...library, styles: [...library.styles, { id: crypto.randomUUID(), name: safeName, style: structuredClone(source) }] }, `${safeName} 저장됨`);
  }
  type NumericKey = 'size' | 'outline' | 'outer' | 'radius' | 'padding' | 'shadow' | 'opacity' | 'maxWidth' | 'lineHeight';
  const number = (key: NumericKey, label: string, min: number, max: number, step = 1, factor = 1) => {
    const update = (n: number) => { if (Number.isFinite(n)) change({ [key]: Math.max(min, Math.min(max, n)) / factor }); };
    return <div className="caption-number"><label htmlFor={`caption-${key}`}>{label}</label><div><input type="range" aria-label={`${label} 슬라이더`} min={min} max={max} step={step} value={style[key] * factor} disabled={disabled} onFocus={onBegin} onBlur={onEnd} onPointerDown={onBegin} onPointerUp={onEnd} onChange={e => update(e.target.valueAsNumber)} /><input id={`caption-${key}`} type="number" aria-label={label} min={min} max={max} step={step} value={Number((style[key] * factor).toFixed(3))} disabled={disabled} onFocus={onBegin} onBlur={onEnd} onChange={e => update(e.target.valueAsNumber)} /></div></div>;
  };
  const color = (key: 'color' | 'outlineColor' | 'outerColor' | 'background', label: string) => <label>{label}<input type="color" aria-label={label} value={style[key]} disabled={disabled} onFocus={onBegin} onBlur={onEnd} onChange={e => change({ [key]: e.target.value })} /></label>;
  const toggle = (key: 'outline' | 'outer' | 'opacity' | 'shadow', label: string, fallback: number) => <label className="caption-check"><input type="checkbox" aria-label={label} checked={style[key] > 0} disabled={disabled} onChange={e => change({ [key]: e.target.checked ? fallback : 0 })} />{label}</label>;
  function motionEdge(edge: 'enter' | 'exit') {
    const value = style.motion[edge], label = edge === 'enter' ? '등장' : '퇴장';
    const update = (patch: Partial<CaptionMotion['enter']>) => change({ motion: { ...style.motion, [edge]: { ...value, ...patch } } });
    return <div className="property-group"><h3>{label}</h3><label>효과<select aria-label={`자막 ${label} 효과`} value={value.type} disabled={disabled} onChange={e => update({ type: e.target.value as CaptionMotion['enter']['type'] })}><option value="none">없음</option><option value="fade">페이드</option><option value="pop">팝</option><option value="slide">슬라이드</option></select></label>
      {value.type !== 'none' && <><label>시간 (초)<input type="number" aria-label={`자막 ${label} 시간`} value={Number((value.frames / 30).toFixed(3))} min={.1} max={1} step={.1} disabled={disabled} onFocus={onBegin} onBlur={onEnd} onChange={e => { const n = e.target.valueAsNumber; if (Number.isFinite(n)) update({ frames: Math.max(3, Math.min(30, Math.round(n * 30))) }); }} /></label>{value.type === 'slide' && <label>이동 방향<select aria-label={`자막 ${label} 방향`} value={value.direction} disabled={disabled} onChange={e => update({ direction: e.target.value as CaptionMotion['enter']['direction'] })}><option value="up">위로</option><option value="down">아래로</option><option value="left">왼쪽으로</option><option value="right">오른쪽으로</option></select></label>}</>}
    </div>;
  }
  return <div className="caption-controls">
    <h2>{KIND_LABEL[caption.kind]}</h2><div className="caption-object-actions"><button disabled={disabled || caption.kind === 'title' || project.captions.length >= 2000} aria-label="자막 복제" title="자막 복제" onClick={onDuplicate}>복제</button><button disabled={disabled} aria-label="자막 삭제" title="자막 삭제" onClick={onDelete}>삭제</button><button disabled={disabled} aria-label="앞으로 가져오기" title="앞으로 가져오기" onClick={() => onOrder(1)}>앞으로</button><button disabled={disabled} aria-label="뒤로 보내기" title="뒤로 보내기" onClick={() => onOrder(-1)}>뒤로</button></div>
    <label className="caption-scope">적용 대상<select aria-label="자막 적용 대상" value={common ? 'common' : 'one'} disabled={disabled} onChange={e => setCommon(e.target.value === 'common')}><option value="one">이 자막만</option><option value="common">{KIND_LABEL[caption.kind]} 공통</option></select></label>
    <p className="caption-scope-hint">{common ? '기본값을 사용하는 같은 종류의 자막에 함께 적용됩니다.' : '선택한 자막만 조절합니다.'}</p>
    <div className="caption-tabs" role="tablist" aria-label="자막 속성 탭">{([['style', '스타일'], ['decorate', '꾸미기'], ['motion', '움직임']] as const).map(([id, label]) => <button role="tab" aria-selected={tab === id} key={id} onClick={() => setTab(id)}>{label}</button>)}</div>
    {tab === 'style' && <section aria-label="자막 스타일">
      <div className="caption-library-tabs">{[['all', '전체'], ['favorites', '★ 즐겨찾기'], ['saved', '내 스타일']].map(([id, label]) => <button key={id} aria-pressed={filter === id} onClick={() => { setFilter(id); setCategory('all'); }}>{label}</button>)}</div>
      <div className="caption-search"><input aria-label="자막 스타일 검색" placeholder="스타일 이름 검색" value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="자막 스타일 분류" value={category} onChange={e => setCategory(e.target.value)}><option value="all">모든 분위기</option>{PRESET_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
      <label className="caption-check"><input type="checkbox" checked={includeLayout} onChange={e => setIncludeLayout(e.target.checked)} />크기·위치도 적용</label>
      <div className="caption-presets">{visible.map(p => <PresetCard key={p.id} preset={p} disabled={disabled} libraryDisabled={libraryDisabled} favorite={library.favorites.includes(p.id)} onApply={apply} onFavorite={favorite} />)}</div>
      {!visible.length && <p className="hint">{filter === 'favorites' ? '카드의 ☆을 눌러 자주 쓰는 스타일을 모아 보세요.' : '표시할 스타일이 없습니다.'}</p>}
      <div className="property-group"><h3>내 스타일 저장 · {library.styles.length}/100</h3><input type="text" aria-label="내 자막 설정 이름" placeholder="예: 내 브이로그 기본" maxLength={80} value={name} onChange={e => setName(e.target.value)} /><button disabled={libraryDisabled || !name.trim() || library.styles.length >= 100} onClick={() => saveNew(style, name)}>현재 스타일 저장</button><p className="hint">디자인과 움직임을 저장합니다. 크기·위치는 선택해서 적용할 수 있습니다.</p>
      </div>
      {chosen && <div className="property-group"><h3>선택한 내 스타일 관리</h3><input aria-label="저장 스타일 새 이름" value={rename} maxLength={80} onChange={e => setRename(e.target.value)} /><div className="caption-object-actions"><button disabled={libraryDisabled || !rename.trim()} onClick={() => void persist({ ...library, styles: library.styles.map(p => p.id === chosen.id ? { ...p, name: rename.trim() } : p) }, '이름을 변경했습니다.')}>이름 변경</button><button disabled={libraryDisabled} onClick={() => void persist({ ...library, styles: library.styles.map(p => p.id === chosen.id ? { ...p, style: structuredClone(style) } : p) }, '현재 설정으로 덮어썼습니다.')}>현재 설정으로 덮어쓰기</button><button disabled={libraryDisabled || library.styles.length >= 100} onClick={() => saveNew(chosen.style, `${chosen.name} 복사본`)}>스타일 복제</button><button disabled={libraryDisabled} onClick={() => void persist({ ...library, styles: library.styles.filter(p => p.id !== chosen.id), favorites: library.favorites.filter(id => id !== `user:${chosen.id}`) }, '스타일을 삭제했습니다.')}>스타일 삭제</button></div><p className="hint">보관함을 바꿔도 이미 적용한 자막은 유지됩니다.</p></div>}
      <p className="caption-library-status" role="status">{saving ? '저장 중…' : !loaded ? '보관함을 불러오는 중…' : notice}</p>
    </section>}
    {tab === 'decorate' && <section aria-label="자막 꾸미기">
      <div className="property-group"><h3>글자</h3><label>글꼴<select aria-label="자막 글꼴" value={style.font} disabled={disabled} onChange={e => { const font = e.target.value as CaptionStyle['font']; change({ font, weight: captionFontWeight(font, style.weight) }); }}>{Object.entries(CAPTION_FONTS).map(([id, font]) => <option key={id} value={id}>{font.label}</option>)}</select></label><label>굵기<select aria-label="자막 굵기" value={captionFontWeight(style.font, style.weight)} disabled={disabled} onChange={e => change({ weight: Number(e.target.value) })}>{CAPTION_FONTS[style.font].weights.map(w => <option key={w} value={w}>{w}</option>)}</select></label>{number('size', '자막 글자 크기', 16, 200)}{color('color', '글씨 색상')}</div>
      <div className="property-group"><h3>외곽선</h3>{toggle('outline', '외곽선 사용', 3)}{number('outline', '외곽선 두께', 0, 16)}{color('outlineColor', '외곽선 색상')}{toggle('outer', '이중 외곽선 사용', 3)}{number('outer', '바깥 외곽선 두께', 0, 16)}{color('outerColor', '바깥 외곽선 색상')}</div>
      <div className="property-group"><h3>배경</h3>{toggle('opacity', '배경 사용', .8)}{color('background', '자막 배경 색상')}{number('opacity', '배경 불투명도 (%)', 0, 100, 1, 100)}{number('radius', '배경 둥글기', 0, 60)}{number('padding', '배경 안쪽 여백', 0, 60)}</div>
      <div className="property-group"><h3>그림자</h3>{toggle('shadow', '그림자 사용', 4)}{number('shadow', '그림자 강도', 0, 20)}</div>
      <div className="property-group"><h3>문단과 배치</h3><label>문단 정렬<select aria-label="자막 문단 정렬" value={style.align} disabled={disabled} onChange={e => change({ align: e.target.value as CaptionStyle['align'] })}><option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option></select></label>{number('lineHeight', '자막 줄 간격', 1.2, 2.4, .1)}{number('maxWidth', '자막 최대 폭 (%)', 20, 100, 1, 100)}
      <div className="position-grid" aria-label="자막 9방향 정렬">{([0, .5, 1] as const).flatMap((v, row) => ([0, .5, 1] as const).map((h, col) => <button key={`${h}-${v}`} disabled={disabled} aria-label={`자막 ${['위', '가운데', '아래'][row]} ${['왼쪽', '중앙', '오른쪽'][col]}`} aria-pressed={style.position.h === h && style.position.v === v && style.position.x === null && style.position.y === null} onClick={() => change({ position: { h, v, x: null, y: null } })}>{['↖', '↑', '↗', '←', '●', '→', '↙', '↓', '↘'][row * 3 + col]}</button>))}</div><button disabled={disabled} onClick={onAlignAll}>같은 종류 모두 크기·위치 맞추기</button></div>
      <details className="property-group"><summary>정렬 기준 여백</summary>{(['horizontal', 'top', 'bottom'] as const).map(key => <label key={key}>{key === 'horizontal' ? '좌우' : key === 'top' ? '위' : '아래'} (%)<input type="number" aria-label={`자막 ${key} 여백`} value={Math.round((project.captionSettings.margins[key] ?? (project.settings.width * 16 === project.settings.height * 9 ? .18 : .1)) * 100)} min={0} max={key === 'bottom' ? 40 : 30} disabled={disabled} onFocus={onBegin} onBlur={onEnd} onChange={e => { const n = e.target.valueAsNumber; if (Number.isFinite(n)) onMargins({ ...project.captionSettings.margins, [key]: Math.max(0, Math.min(key === 'bottom' ? 40 : 30, n)) / 100 }); }} /></label>)}<button disabled={disabled} onClick={() => onMargins({ horizontal: .08, top: .1, bottom: null })}>기본 여백</button></details>
    </section>}
    {tab === 'motion' && <section aria-label="자막 움직임">{motionEdge('enter')}{motionEdge('exit')}<button className="caption-preview-motion" disabled={disabled} onClick={onPreview}>▶ 움직임 미리보기</button><p className="hint">짧은 자막은 효과 시간을 자동으로 줄입니다. 최소 한 프레임은 온전히 표시합니다.</p></section>}
    <div className="property-group"><h3>표시 구간 · {caption.kind === 'title' ? '영상 전체' : '클립 안에서'}</h3>{clip && (['start', 'end'] as const).map(edge => <label key={edge}>{edge === 'start' ? '시작' : '끝'} (초)<input type="number" aria-label={`자막 ${edge === 'start' ? '시작' : '끝'} 초`} min={0} step={1 / 30} value={Number(((edge === 'start' ? caption.inFrame : caption.outFrame) - clip.inFrame) / 30).toFixed(3)} disabled={disabled} onFocus={onBegin} onBlur={onEnd} onChange={e => { if (Number.isFinite(e.target.valueAsNumber)) { const f = clip.inFrame + Math.round(e.target.valueAsNumber * 30); onRange(edge === 'start' ? Math.min(f, caption.outFrame - 1) : caption.inFrame, edge === 'end' ? Math.max(f, caption.inFrame + 1) : caption.outFrame); } }} /></label>)}<button disabled={disabled} onClick={onReset}>공통 설정으로 복귀</button></div>
  </div>;
}
