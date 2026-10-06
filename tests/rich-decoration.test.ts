import test from 'node:test';
import assert from 'node:assert/strict';
import { addMedia, newProject, ProjectSchema, split, trim, removeClip, type Media } from '../src/shared/project';
import { addCaption, captureCaptionGroup, applyCaptionGroup, CaptionLibrarySchema, emptyCaptionLibrary, effectiveStyle } from '../src/shared/captions';
import { formatTextRange, remapTextRuns, textStyleAt, captionFontWeight } from '../src/shared/rich-text';
import { addDecoration, decorationSpans, activeDecorations, reorderDecoration, gradientVector, GradientSchema, gradientStops, gradientCss } from '../src/shared/decoration';
const media: Media = { id: crypto.randomUUID(), path: 'C:/fixture.mp4', name: 'fixture', fingerprint: 'fixture', durationFrames: 120, width: 1920, height: 1080, codec: 'h264', sourceFps: 30, timeBase: '1/30', startTime: 0, rotation: 0, hasAudio: false, warnings: [] };
const fixture = () => addMedia(newProject(), [media]);
test('partial fonts compose, reset independently, and do not split emoji graphemes', () => {
  const text = '안녕 👩‍👩‍👧‍👦 좋은 하루';
  let runs = formatTextRange(text, [], 0, 2, { font: 'nanumpen', size: 60 });
  runs = formatTextRange(text, runs, 1, 2, { color: '#ff0000' });
  assert.deepEqual(textStyleAt(runs, 0), { font: 'nanumpen', size: 60 });
  assert.deepEqual(textStyleAt(runs, 1), { font: 'nanumpen', size: 60, color: '#ff0000' });
  runs = formatTextRange(text, runs, 4, 5, { size: 90 });
  assert.equal(runs.at(-1)?.start, 3); assert.equal(runs.at(-1)?.end, 14);
  runs = formatTextRange(text, runs, 1, 2, null); assert.deepEqual(textStyleAt(runs, 1), {});
  assert.equal(captionFontWeight('nanumpen', 900), 400); assert.equal(captionFontWeight('sans', 450), 450);
});
test('typing, pasted replacement, deletion and Korean composition preserve unrelated formatting', () => {
  let text = '오늘은 좋은 하루', runs = formatTextRange(text, [], 4, 6, { font: 'maruburi', size: 80 });
  let next = '오늘은 정말 좋은 하루'; runs = remapTextRuns(text, next, runs); text = next;
  assert.deepEqual(textStyleAt(runs, 7), { font: 'maruburi', size: 80 }); assert.deepEqual(textStyleAt(runs, 4), {});
  next = '오늘은 정말 멋진 하루'; runs = remapTextRuns(text, next, runs); text = next;
  assert.deepEqual(textStyleAt(runs, 7), { font: 'maruburi', size: 80 });
  for (const tail of [' ㄱ', ' 가', ' 간', ' 간다']) { const edited = '오늘은 정말 멋진 하루' + tail; runs = remapTextRuns(text, edited, runs); text = edited; }
  assert.deepEqual(textStyleAt(runs, 7), { font: 'maruburi', size: 80 });
  assert.deepEqual(remapTextRuns(text, '', runs), []);
});
test('legacy project/library migration, groups and duplication preserve mixed fonts and gradients', () => {
  let p = fixture(); p = addCaption(p, p.clips[0].id, 'title', 0).project;
  const c = p.captions[0]; c.runs = formatTextRange(c.text, [], 0, 2, { font: 'nanumpen', size: 30 }); c.overrides.gradient = { angle: 135, from: '#112233', to: '#abcdef' };
  const group = captureCaptionGroup(p, [c.id], '혼합 제목');
  const library = CaptionLibrarySchema.parse({ ...emptyCaptionLibrary(), groups: [group] });
  const applied = applyCaptionGroup(p, library.groups[0]); assert.deepEqual(applied.project.captions[1].runs, c.runs);
  assert.deepEqual(effectiveStyle(applied.project, applied.project.captions[1]).gradient, c.overrides.gradient);
  const old = JSON.parse(JSON.stringify(p)); old.version = 7; delete old.decorations; delete old.captions[0].runs;
  for (const key of ['normal', 'emphasis', 'title']) delete old.captionSettings[key].gradient;
  const migrated = ProjectSchema.parse(old); assert.equal(migrated.version, 8); assert.deepEqual(migrated.decorations, []); assert.deepEqual(migrated.captions[0].runs, []);
  const oldLibrary = JSON.parse(JSON.stringify(library)); oldLibrary.version = 2; delete oldLibrary.groups[0].items[0].runs;
  assert.deepEqual(CaptionLibrarySchema.parse(oldLibrary).groups[0].items[0].runs, []);
  assert.throws(() => ProjectSchema.parse({ ...p, captions: [{ ...c, runs: [{ start: 0, end: 2000, style: {} }] }] }));
});
test('shapes follow source time through clip trims/splits/deletes, including shape-only projects', () => {
  let p = fixture(); p = addDecoration(p, p.clips[0].id, 'rectangle', 30).project; p = addDecoration(p, p.clips[0].id, 'ellipse', 75).project;
  p = trim(p, p.clips[0].id, 30, 120); assert.deepEqual(decorationSpans(p).map(s => [s.start, s.end]), [[0, 90], [45, 90]]);
  assert.equal(activeDecorations(p, 44).length, 1); assert.equal(activeDecorations(p, 45).length, 2);
  const cut = split(p, p.clips[0].id, 45); assert.equal(cut.decorations.length, 3); ProjectSchema.parse(cut);
  assert.equal(removeClip(cut, cut.clips[0].id).decorations.length, 2);
  assert.deepEqual(ProjectSchema.parse(JSON.parse(JSON.stringify(p))).decorations, p.decorations);
  p = reorderDecoration(p, p.decorations[1].id, 'back'); assert.equal(activeDecorations(p, 50)[0].kind, 'ellipse');
});
test('gradient angles use CSS orientation and cover rectangular backgrounds', () => {
  const horizontal = gradientVector(200, 100, 90); assert.ok(Math.abs(horizontal.x0) < 1e-9); assert.equal(horizontal.x1, 200);
  const vertical = gradientVector(200, 100, 180); assert.ok(Math.abs(vertical.y0) < 1e-9); assert.ok(Math.abs(vertical.y1 - 100) < 1e-9);
  const reverse = gradientVector(200, 100, 270); assert.equal(reverse.x0, 200); assert.ok(Math.abs(reverse.x1) < 1e-9);
});
test('hard gradients keep two solid halves while legacy gradients remain soft in projects and libraries', () => {
  const legacy = { angle: 135, from: '#112233', to: '#abcdef' };
  assert.deepEqual(gradientStops(GradientSchema.parse(legacy)), [[0, legacy.from], [1, legacy.to]]);
  assert.deepEqual(gradientStops({ ...legacy, mode: 'soft' }), gradientStops(legacy));
  const hard = { ...legacy, mode: 'hard' as const };
  assert.deepEqual(gradientStops(hard), [[0, legacy.from], [.5, legacy.from], [.5, legacy.to], [1, legacy.to]]);
  assert.equal(gradientCss(hard), 'linear-gradient(135deg, #112233 0%, #112233 50%, #abcdef 50%, #abcdef 100%)');
  assert.throws(() => GradientSchema.parse({ ...legacy, mode: 'unknown' }));
  let p = fixture(); p = addCaption(p, p.clips[0].id, 'title', 0).project; p.captions[0].overrides.gradient = hard;
  p = ProjectSchema.parse(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(effectiveStyle(p, p.captions[0]).gradient, hard);
  const group = captureCaptionGroup(p, [p.captions[0].id], '하드 배경');
  const library = CaptionLibrarySchema.parse(JSON.parse(JSON.stringify({ ...emptyCaptionLibrary(), groups: [group], defaultGroupId: group.id, styles: [{ id: crypto.randomUUID(), name: '하드', style: effectiveStyle(p, p.captions[0]) }] })));
  const applied = applyCaptionGroup(p, library.groups[0], p.clips[0].id, 30).project;
  assert.deepEqual(effectiveStyle(applied, applied.captions[1]).gradient, hard); assert.deepEqual(library.styles[0].style.gradient, hard);
});
