import { useEffect, useRef, useState } from 'react';
import { captureCaptionGroup, captionSpans, KIND_LABEL, type SavedCaptionGroup } from '../shared/captions';
import { decorationSpans } from '../shared/decoration';
import type { Project } from '../shared/project';
import type { useCaptionLibrary } from '../useCaptionLibrary';

export function CaptionGroups({ project, frame, focusRequest, checked, onChecked, disabled, libraryState, onApply, onError }: {
  project: Project; frame: number; focusRequest: number; checked: string[]; onChecked(ids: string[]): void; disabled: boolean;
  libraryState: ReturnType<typeof useCaptionLibrary>; onApply(group: SavedCaptionGroup): boolean; onError(message: string): void;
}) {
  const { library, loaded, saving, persist } = libraryState;
  const [name, setName] = useState(''), [managed, setManaged] = useState(''), [rename, setRename] = useState(''), [notice, setNotice] = useState('');
  const nameField = useRef<HTMLInputElement>(null);
  useEffect(() => { if (focusRequest) nameField.current?.focus(); }, [focusRequest]);
  const ids = checked.filter(id => project.captions.some(c => c.id === id));
  const shapeIds = checked.filter(id => project.decorations.some(s => s.id === id));
  const spans = captionSpans(project), shapes = decorationSpans(project);
  const locked = disabled || !loaded || saving;
  const chosen = library.groups.find(g => g.id === managed), defaultGroup = library.groups.find(g => g.id === library.defaultGroupId);
  const validSelection = ids.length > 0 && ids.length <= 50 && shapeIds.length <= 50;
  const canSave = !locked && validSelection && !!name.trim() && library.groups.length < 50;
  async function save(overwrite = false, asDefault = false) {
    if (locked || !validSelection || (overwrite && !chosen)) return;
    try {
      const snapshot = captureCaptionGroup(project, ids, overwrite ? chosen!.name : name, shapeIds);
      const group = overwrite ? { ...snapshot, id: chosen!.id } : snapshot;
      const groups = overwrite ? library.groups.map(g => g.id === group.id ? group : g) : [...library.groups, group];
      if (await persist({ ...library, groups, defaultGroupId: asDefault ? group.id : library.defaultGroupId })) { setManaged(group.id); setRename(group.name); setNotice(`${group.name} · 글 ${group.items.length}개 + 도형 ${group.decorations.length}개 저장됨${asDefault ? ' · ＋ 자막에 기본 적용' : ''}`); }
    } catch (error) { onError(String(error)); }
  }
  return <section className="caption-groups" aria-label="글과 꾸미기 보관함">
    <h3>제목·꾸미기 묶음</h3>
    <div className="group-selection"><strong>글 {ids.length} · 도형 {shapeIds.length}개 선택</strong><button disabled={locked} onClick={() => onChecked([...spans.map(s => s.caption.id), ...shapes.map(s => s.shape.id)])}>모두 선택</button><button disabled={locked || !checked.length} onClick={() => onChecked([])}>해제</button></div>
    <button className="group-save" disabled={locked} onClick={() => onChecked([...spans.filter(s => s.start <= frame && frame < s.end).map(s => s.caption.id), ...shapes.filter(s => s.start <= frame && frame < s.end).map(s => s.shape.id)])}>현재 화면 선택</button>
    {shapes.length > 0 && <details className="group-shapes"><summary>함께 저장할 꾸미기 · {shapeIds.length}개</summary><div>{shapes.map(({ shape }) => <label key={shape.id}><input type="checkbox" aria-label={`묶음에 포함할 도형 ${shape.name}`} checked={shapeIds.includes(shape.id)} disabled={locked} onChange={e => onChecked(e.target.checked ? [...checked, shape.id] : checked.filter(id => id !== shape.id))} />{shape.kind === 'rectangle' ? '▰' : '●'} {shape.name}</label>)}</div></details>}
    <input ref={nameField} aria-label="새 글 그룹 이름" placeholder="예: 내 브이로그 기본 자막" maxLength={80} value={name} onChange={e => setName(e.target.value)} />
    <button className="group-save" disabled={!canSave} onClick={() => void save()}>선택한 글·꾸미기 저장</button>
    <button className="group-save" disabled={!canSave} onClick={() => void save(false, true)}>기본 자막 스타일로 저장</button>
    <p className="hint">글 목록의 ‘그룹에 포함’과 위 꾸미기에서 고르거나 현재 화면을 선택하세요. 문구·부분 글꼴·배경·위치·도형을 함께 저장합니다. 글·도형 각각 최대 50개.</p>
    <p className="group-default" role="status">기본 자막: {defaultGroup?.name ?? '기본 제공 스타일'}{defaultGroup && <button disabled={locked} onClick={async () => { if (await persist({ ...library, defaultGroupId: null })) setNotice('기본 제공 자막으로 돌아갑니다. 저장한 묶음은 유지됩니다.'); }}>기본 지정 해제</button>}</p>
    <details className="group-library"><summary>저장한 묶음 · {library.groups.length}/50</summary>
      {!library.groups.length && <p className="hint">저장한 묶음은 다른 프로젝트에서도 사용할 수 있습니다.</p>}
      <select aria-label="저장한 글 그룹" value={chosen?.id ?? ''} disabled={locked || !library.groups.length} onChange={e => { const group = library.groups.find(g => g.id === e.target.value); setManaged(e.target.value); setRename(group?.name ?? ''); setNotice(''); }}>
        <option value="">묶음 선택</option>{library.groups.map(g => <option key={g.id} value={g.id}>{g.name} · 글 {g.items.length} / 도형 {g.decorations.length}{g.id === library.defaultGroupId ? ' · 기본' : ''}</option>)}
      </select>
      {chosen && <div className="group-details">
        <ol>{chosen.items.map((item, i) => <li key={i}><strong>{KIND_LABEL[item.kind]} {i + 1}</strong><p>{item.text || '(빈 글)'}</p><small>크기 {item.style.size} · 배경 {item.style.opacity > 0 ? `${Math.round(item.style.opacity * 100)}%` : '끔'}</small></li>)}</ol>
        {chosen.decorations.length > 0 && <p>꾸미기: {chosen.decorations.map(s => s.name).join(', ')}</p>}
        <button disabled={locked || !project.clips.length || project.captions.length + chosen.items.length > 2000 || project.decorations.length + chosen.decorations.length > 500} onClick={() => { if (onApply(chosen)) setNotice('글과 꾸미기를 추가했습니다. 편집 후 이 묶음에 덮어쓸 수 있습니다.'); }}>그룹 불러오기</button>
        <p className="hint">불러오기는 원래 글 종류·표시 시간을 유지합니다. 짧은 장면에서는 표시 구간을 맞춥니다.</p>
        <button disabled={locked || chosen.id === library.defaultGroupId} onClick={async () => { if (await persist({ ...library, defaultGroupId: chosen.id })) setNotice(`${chosen.name} · ＋ 자막의 기본 스타일로 지정했습니다.`); }}>기본 자막으로 지정</button>
        <p className="hint">기본으로 지정하면 ＋ 자막을 누를 때 글과 도형이 함께 생깁니다. 현재 재생 위치부터 장면 끝까지 표시되며 문구와 꾸미기는 각각 편집할 수 있습니다.</p>
        <button disabled={locked || !validSelection} onClick={() => void save(true)}>선택한 글·꾸미기로 덮어쓰기</button>
        <input aria-label="글 그룹 새 이름" value={rename} maxLength={80} onChange={e => setRename(e.target.value)} />
        <div className="group-actions"><button disabled={locked || !rename.trim()} onClick={async () => { if (await persist({ ...library, groups: library.groups.map(g => g.id === chosen.id ? { ...g, name: rename.trim() } : g) })) setNotice('그룹 이름을 변경했습니다.'); }}>그룹 이름 변경</button>
          <button disabled={locked} onClick={async () => { if (await persist({ ...library, groups: library.groups.filter(g => g.id !== chosen.id), defaultGroupId: library.defaultGroupId === chosen.id ? null : library.defaultGroupId })) { setManaged(''); setNotice('보관함에서 묶음을 삭제했습니다.'); } }}>그룹 삭제</button></div>
        <p className="hint">저장한 묶음과 기본 지정을 바꿔도 이미 영상에 넣은 글·도형은 유지됩니다.</p>
      </div>}
    </details>
    <p role="status" className="group-status">{saving ? '보관함 저장 중…' : !loaded ? '보관함을 불러오는 중…' : notice}</p>
  </section>;
}
