import test from 'node:test';
import assert from 'node:assert/strict';
import { addMedia, newProject, ProjectSchema, trim, commit, undo, redo, type Media } from '../src/shared/project';
import { addCaption, duplicateCaption, effectiveStyle, captionRect, captureCaptionGroup, applyCaptionGroup, emptyCaptionLibrary, CaptionLibrarySchema, SavedCaptionGroupSchema } from '../src/shared/captions';

const media: Media = { id: crypto.randomUUID(), path: 'C:/group.mp4', name: 'group', fingerprint: 'group', durationFrames: 120, width: 640, height: 360, codec: 'h264', sourceFps: 30, timeBase: '1/30', startTime: 0, rotation: 0, hasAudio: false, warnings: [] };
const fixture = () => addMedia(newProject(), [media]);
function example() {
  let p = fixture();
  for (const kind of ['title', 'title', 'normal'] as const) p = addCaption(p, p.clips[0].id, kind, 0).project;
  p.captions[0].text = '일단 이렇게 시작해보겠습니다.'; p.captions[0].overrides.size = 60;
  p.captions[1].text = '에피소드 2'; p.captions[1].overrides = { ...p.captions[1].overrides, size: 30, opacity: .8, background: '#ffffff' };
  return p;
}
test('multiple titles have independent styles, placement and duplicate IDs, including v6 migration', () => {
  const p = example(); const copy = duplicateCaption(p, p.captions[1].id).project;
  assert.equal(copy.captions.length, 4); assert.equal(new Set(copy.captions.map(c => c.id)).size, 4);
  assert.notDeepEqual(effectiveStyle(p, p.captions[0]).position, effectiveStyle(p, p.captions[1]).position);
  copy.captions[3].overrides.size = 90; assert.equal(effectiveStyle(p, p.captions[1]).size, 30);
  const migrated = ProjectSchema.parse({ ...p, version: 6 }); assert.equal(migrated.version, 8); assert.deepEqual(migrated.captions, p.captions);
  assert.throws(() => ProjectSchema.parse({ ...p, captions: [p.captions[0], p.captions[0]] }));
});
test('group snapshots preserve every text, style and placement across defaults, reload, and one-step undo', () => {
  const p = example(), group = captureCaptionGroup(p, p.captions.map(c => c.id), '인트로');
  const loaded = CaptionLibrarySchema.parse(JSON.parse(JSON.stringify({ ...emptyCaptionLibrary(), groups: [group] })));
  const target = fixture(); target.captionSettings.title.size = 120; target.captionSettings.margins.top = .2;
  const result = applyCaptionGroup(target, loaded.groups[0], target.clips[0].id);
  assert.deepEqual(result.project.captions.map(c => c.text), p.captions.map(c => c.text));
  assert.deepEqual(result.project.captions.map(c => effectiveStyle(result.project, c).size), [60, 30, 54]);
  for (let i = 0; i < p.captions.length; i++) {
    const before = captionRect({ width: 200, height: 100 }, effectiveStyle(p, p.captions[i]), p.settings, p.captionSettings.margins);
    const after = captionRect({ width: 200, height: 100 }, effectiveStyle(result.project, result.project.captions[i]), target.settings, target.captionSettings.margins);
    assert.deepEqual(after, before);
  }
  const history = commit({ past: [], present: target, future: [] }, result.project);
  assert.equal(undo(history).present.captions.length, 0); assert.equal(redo(undo(history)).present.captions.length, 3);
  result.project.captions[0].overrides.size = 80; assert.equal(group.items[0].style.size, 60);
  p.captions[1].overrides.opacity = 0; assert.equal(group.items[1].style.opacity, .8);
  ProjectSchema.parse(result.project);
});
test('subtitle groups adapt safely to trimmed short clips and refuse missing clips or capacity overflow', () => {
  const p = example(); p.captions[2].inFrame = 90;
  const group = captureCaptionGroup(p, p.captions.map(c => c.id), '혼합');
  const target = fixture(), short = trim(target, target.clips[0].id, 30, 31);
  const result = applyCaptionGroup(short, group, short.clips[0].id).project;
  assert.deepEqual([result.captions[2].inFrame, result.captions[2].outFrame], [30, 31]); ProjectSchema.parse(result);
  assert.throws(() => applyCaptionGroup(target, group));
  assert.throws(() => applyCaptionGroup({ ...target, captions: Array(2000).fill(p.captions[0]) }, group, target.clips[0].id));
  assert.throws(() => captureCaptionGroup(p, [], '빈 그룹'));
  assert.throws(() => SavedCaptionGroupSchema.parse({ ...group, items: [{ ...group.items[0], startFrame: 2 }] }));
});
test('legacy style favorites migrate without data loss and malformed groups are rejected', () => {
  const p = example(), style = { id: crypto.randomUUID(), name: '이전 스타일', style: effectiveStyle(p, p.captions[0]) };
  const old = { version: 1, styles: [style], favorites: [`user:${style.id}`] };
  const migrated = CaptionLibrarySchema.parse(old); assert.equal(migrated.version, 4); assert.deepEqual(migrated.styles, old.styles); assert.deepEqual(migrated.favorites, old.favorites); assert.deepEqual(migrated.groups, []);
  const group = captureCaptionGroup(p, p.captions.map(c => c.id), '그룹');
  assert.throws(() => CaptionLibrarySchema.parse({ ...migrated, groups: [group, group] }));
  assert.throws(() => CaptionLibrarySchema.parse({ ...migrated, version: 99 }));
  assert.throws(() => SavedCaptionGroupSchema.parse({ ...group, items: [{ ...group.items[1], style: { ...group.items[1].style, size: 999 } }] }));
});
