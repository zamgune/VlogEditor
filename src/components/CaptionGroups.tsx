import { useState } from 'react';
import { captureCaptionGroup, captionSpans, KIND_LABEL, type SavedCaptionGroup } from '../shared/captions';
import type { Project } from '../shared/project';
import type { useCaptionLibrary } from '../useCaptionLibrary';

export function CaptionGroups({ project, checked, onChecked, disabled, libraryState, onApply, onError }: {
  project: Project; checked: string[]; onChecked(ids: string[]): void; disabled: boolean;
  libraryState: ReturnType<typeof useCaptionLibrary>; onApply(group: SavedCaptionGroup): boolean; onError(message: string): void;
}) {
  const { library, loaded, saving, persist } = libraryState;
  const [name, setName] = useState(''), [managed, setManaged] = useState(''), [rename, setRename] = useState(''), [notice, setNotice] = useState('');
  const ids = checked.filter(id => project.captions.some(c => c.id === id));
  const locked = disabled || !loaded || saving;
  const chosen = library.groups.find(g => g.id === managed);
  const validSelection = ids.length > 0 && ids.length <= 50;
  async function save(overwrite = false) {
    if (locked || !validSelection || (overwrite && !chosen)) return;
    try {
      const snapshot = captureCaptionGroup(project, ids, overwrite ? chosen!.name : name);
      const group = overwrite ? { ...snapshot, id: chosen!.id } : snapshot;
      const groups = overwrite ? library.groups.map(g => g.id === group.id ? group : g) : [...library.groups, group];
      if (await persist({ ...library, groups })) { setManaged(group.id); setRename(group.name); setNotice(`${group.name} · 글 ${group.items.length}개 저장됨`); }
    } catch (error) { onError(String(error)); }
  }
  return <section className="caption-groups" aria-label="글 그룹 보관함">
    <div className="group-selection"><strong>그룹 선택 · {ids.length}개</strong><button disabled={locked} onClick={() => onChecked(captionSpans(project).map(s => s.caption.id))}>모두 선택</button><button disabled={locked || !ids.length} onClick={() => onChecked([])}>해제</button></div>
    <input aria-label="새 글 그룹 이름" placeholder="예: 에피소드 시작 제목" maxLength={80} value={name} onChange={e => setName(e.target.value)} />
    <button className="group-save" disabled={locked || !validSelection || !name.trim() || library.groups.length >= 50} onClick={() => void save()}>선택한 글을 새 그룹으로 저장</button>
    <p className="hint">목록에서 ‘그룹에 포함’을 체크하세요. 문구·크기·배경·위치·움직임을 함께 저장합니다. 그룹당 최대 50개.</p>
    <details className="group-library"><summary>저장한 그룹 · {library.groups.length}/50</summary>
      {!library.groups.length && <p className="hint">저장한 그룹은 다른 프로젝트에서도 사용할 수 있습니다.</p>}
      <select aria-label="저장한 글 그룹" value={chosen?.id ?? ''} disabled={locked || !library.groups.length} onChange={e => { const group = library.groups.find(g => g.id === e.target.value); setManaged(e.target.value); setRename(group?.name ?? ''); setNotice(''); }}>
        <option value="">그룹 선택</option>{library.groups.map(g => <option key={g.id} value={g.id}>{g.name} · {g.items.length}개</option>)}
      </select>
      {chosen && <div className="group-details">
        <ol>{chosen.items.map((item, i) => <li key={i}><strong>{KIND_LABEL[item.kind]} {i + 1}</strong><p>{item.text || '(빈 글)'}</p><small>크기 {item.style.size} · 배경 {item.style.opacity > 0 ? `${Math.round(item.style.opacity * 100)}%` : '끔'}</small></li>)}</ol>
        <button disabled={locked || !project.clips.length || project.captions.length + chosen.items.length > 2000} onClick={() => { if (onApply(chosen)) setNotice('글을 추가했습니다. 각 글을 수정한 뒤 이 그룹에 덮어쓸 수 있습니다.'); }}>그룹 불러오기</button>
        <p className="hint">제목은 영상 전체에, 일반·강조 자막은 선택한 클립에 추가합니다. 짧은 클립에서는 표시 구간을 맞춥니다.</p>
        <button disabled={locked || !validSelection} onClick={() => void save(true)}>선택한 글로 그룹 덮어쓰기</button>
        <input aria-label="글 그룹 새 이름" value={rename} maxLength={80} onChange={e => setRename(e.target.value)} />
        <div className="group-actions"><button disabled={locked || !rename.trim()} onClick={async () => { if (await persist({ ...library, groups: library.groups.map(g => g.id === chosen.id ? { ...g, name: rename.trim() } : g) })) setNotice('그룹 이름을 변경했습니다.'); }}>그룹 이름 변경</button>
          <button disabled={locked} onClick={async () => { if (await persist({ ...library, groups: library.groups.filter(g => g.id !== chosen.id) })) { setManaged(''); setNotice('보관함에서 그룹을 삭제했습니다.'); } }}>그룹 삭제</button></div>
        <p className="hint">그룹을 덮어쓰거나 삭제해도 영상에 넣은 글은 유지됩니다.</p>
      </div>}
    </details>
    <p role="status" className="group-status">{saving ? '보관함 저장 중…' : !loaded ? '보관함을 불러오는 중…' : notice}</p>
  </section>;
}
