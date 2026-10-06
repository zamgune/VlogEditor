import test from 'node:test';
import assert from 'node:assert/strict';
import { addMedia, newProject, ProjectSchema, trim, commit, undo, redo, type Media } from '../src/shared/project';
import { addCaption, captionRange, captionRect, captionSpans, copyCaption, duplicateCaption, effectiveStyle, pasteCaption } from '../src/shared/captions';
import { formatTextRange } from '../src/shared/rich-text';
const media: Media = { id: crypto.randomUUID(), path: 'C:/copy.mp4', name: 'copy', fingerprint: 'copy', durationFrames: 300, width: 1920, height: 1080, codec: 'h264', sourceFps: 30, timeBase: '1/30', startTime: 0, rotation: 0, hasAudio: false, warnings: [] };
const fixture = () => addMedia(newProject('16:9'), [media]);
function caption(p: ReturnType<typeof fixture>, start: number, end: number, kind: 'normal' | 'emphasis' = 'normal') {
  const result = addCaption(p, p.clips[0].id, kind, start); return captionRange(result.project, result.id, start, end);
}
test('automatic duplication keeps visible duration and screen position, finds later gaps and ignores full-video titles', () => {
  let p = fixture(); p = trim(p, p.clips[0].id, 30, 210); p = caption(p, 30, 60);
  p = caption(p, 60, 75, 'emphasis'); p = caption(p, 80, 90); p = caption(p, 135, 150);
  p = addCaption(p, p.clips[0].id, 'title', 30).project;
  const original = p.captions[0], copied = copyCaption(p, original.id), position = captionRect({ width: 200, height: 70 }, effectiveStyle(p, original), p.settings, p.captionSettings.margins);
  const result = pasteCaption(p, copied, { autoAfter: true });
  assert.equal(result.movedAfter, true); assert.deepEqual([result.project.captions.at(-1)!.inFrame, result.project.captions.at(-1)!.outFrame], [90, 120]);
  assert.deepEqual(captionRect({ width: 200, height: 70 }, effectiveStyle(result.project, result.project.captions.at(-1)!), p.settings, p.captionSettings.margins), position);
  const repeated = pasteCaption(result.project, copied, { autoAfter: true }); assert.deepEqual([repeated.project.captions.at(-1)!.inFrame, repeated.project.captions.at(-1)!.outFrame], [150, 180]);
  ProjectSchema.parse(repeated.project);
  const history = commit({ past: [], present: p, future: [] }, result.project); assert.deepEqual(undo(history).present, p); assert.deepEqual(redo(undo(history)).present, result.project);
});
test('disabled or full auto placement preserves original time, including hidden trimmed edges and title semantics', () => {
  let p = fixture(); p = caption(p, 0, 60); p = trim(p, p.clips[0].id, 30, 120);
  const original = p.captions[0], disabled = duplicateCaption(p, original.id);
  assert.equal(disabled.movedAfter, false); assert.deepEqual([disabled.project.captions.at(-1)!.inFrame, disabled.project.captions.at(-1)!.outFrame], [0, 60]);
  const auto = duplicateCaption(p, original.id, true); assert.deepEqual([auto.project.captions.at(-1)!.inFrame, auto.project.captions.at(-1)!.outFrame], [60, 90]);
  p = caption(p, 60, 120, 'emphasis'); const full = duplicateCaption(p, original.id, true);
  assert.equal(full.movedAfter, false); assert.deepEqual([full.project.captions.at(-1)!.inFrame, full.project.captions.at(-1)!.outFrame], [0, 60]);
  const title = addCaption(p, p.clips[0].id, 'title', 30); const copy = duplicateCaption(title.project, title.id, true).project.captions.at(-1)!;
  assert.deepEqual([copy.kind, copy.clipId, copy.inFrame, copy.outFrame], ['title', null, 0, 0]); ProjectSchema.parse(full.project);
});
test('clipboard captures a detached rich design and pastes across projects at playhead without inherited-style drift', () => {
  let source = fixture(); source = caption(source, 0, 90); source = trim(source, source.clips[0].id, 30, 120);
  source.captions[0].text = '여행 이야기'; source.captions[0].runs = formatTextRange(source.captions[0].text, [], 0, 2, { font: 'nanumpen', size: 90 });
  source.captions[0].overrides.gradient = { angle: 135, from: '#ff0000', to: '#0000ff', mode: 'hard' };
  const copied = copyCaption(source, source.captions[0].id); assert.equal(copied.durationFrames, 60);
  source.captions[0].text = '바뀐 문구'; source.captions[0].runs = []; source.captionSettings.normal.size = 150;
  const target = fixture(); target.captionSettings.normal.size = 180; target.captionSettings.margins.bottom = .3;
  const result = pasteCaption(target, copied, { clipId: target.clips[0].id, sourceFrame: 45, autoAfter: true }).project;
  const added = result.captions[0]; assert.equal(added.text, '여행 이야기'); assert.deepEqual(added.runs, copied.caption.runs);
  assert.equal(effectiveStyle(result, added).size, 54); assert.equal(effectiveStyle(result, added).gradient?.mode, 'hard');
  assert.deepEqual(captionSpans(result).map(s => [s.start, s.end]), [[45, 105]]); assert.notEqual(added.id, copied.caption.id);
  added.runs[0].style.size = 20; assert.equal(copied.caption.runs[0].style.size, 90); ProjectSchema.parse(result);
  const end = pasteCaption(target, copied, { clipId: target.clips[0].id, sourceFrame: 299 }).project; assert.deepEqual([end.captions[0].inFrame, end.captions[0].outFrame], [299, 300]);
  assert.throws(() => pasteCaption(newProject(), copied)); assert.throws(() => pasteCaption(target, copied));
  assert.throws(() => pasteCaption({ ...target, captions: Array(2000).fill(copied.caption) }, copied, { clipId: target.clips[0].id }));
});
