import test from 'node:test';
import assert from 'node:assert/strict';
import { colorMatrix, colorFilter, ColorSchema, NEUTRAL_COLOR } from '../src/shared/color';
import { addMedia, newProject, ProjectSchema, split, type Media } from '../src/shared/project';
import { pointerFrame, edgeScrollSpeed } from '../src/shared/timeline';
const media: Media = { id: crypto.randomUUID(), name: 'sample.mp4', path: 'C:\\sample.mp4', fingerprint: 'test', durationFrames: 90, width: 1920, height: 1080, codec: 'h264', sourceFps: 30, timeBase: '1/30', startTime: 0, rotation: 0, hasAudio: false, warnings: [] };
test('reusing a source creates independent clips with one media reference', () => {
  const project = addMedia(newProject(), [media, media]);
  assert.equal(project.media.length, 1); assert.equal(project.clips.length, 2);
  project.clips[0].color.brightness = 50;
  assert.equal(project.clips[1].color.brightness, 0);
  assert.doesNotThrow(() => ProjectSchema.parse(project));
});
test('version 1 project migrates to neutral colors without changing original cut data', () => {
  const old = addMedia(newProject(), [media]);
  const input = { ...old, version: 1, clips: old.clips.map(({ color: _, ...clip }) => clip) };
  const migrated = ProjectSchema.parse(input);
  assert.equal(migrated.version, 8); assert.deepEqual(migrated.clips[0].color, NEUTRAL_COLOR);
  assert.equal(migrated.clips[0].outFrame, 90); assert.equal('color' in input.clips[0], false);
});
test('per-clip color survives split and serialization; invalid filter values are rejected', () => {
  const p = addMedia(newProject(), [media]);
  p.clips[0].color = { brightness: 20, contrast: -10, saturation: -30, warmth: 50 };
  const divided = split(p, p.clips[0].id, 30);
  assert.deepEqual(divided.clips[1].color, p.clips[0].color);
  assert.deepEqual(ProjectSchema.parse(JSON.parse(JSON.stringify(divided))), divided);
  assert.throws(() => ColorSchema.parse({ ...NEUTRAL_COLOR, brightness: 101 }));
  assert.throws(() => ColorSchema.parse({ ...NEUTRAL_COLOR, contrast: '1;movie=file' }));
  assert.throws(() => ColorSchema.parse({ ...NEUTRAL_COLOR, saturation: NaN }));
});
test('shared RGB matrix has identity, grayscale and warmth semantics', () => {
  assert.deepEqual(colorMatrix({ ...NEUTRAL_COLOR }), [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
  assert.equal(colorFilter({ ...NEUTRAL_COLOR }), 'null');
  const gray = colorMatrix({ ...NEUTRAL_COLOR, saturation: -100 });
  assert.deepEqual(gray.slice(0, 5), gray.slice(5, 10)); assert.deepEqual(gray.slice(5, 10), gray.slice(10, 15));
  const warm = colorMatrix({ ...NEUTRAL_COLOR, warmth: 50 });
  assert.equal(warm[4], 0.05); assert.equal(warm[14], -0.05);
});
test('pointer-to-frame conversion stays correct when scrolled, zoomed and outside the timeline', () => {
  assert.equal(pointerFrame(160, 100, 0, 60, 600), 30);
  assert.equal(pointerFrame(160, 100, 240, 60, 600), 150);
  assert.equal(pointerFrame(160, 100, 240, 120, 600), 75);
  assert.equal(pointerFrame(-100, 100, 0, 60, 600), 0);
  assert.equal(pointerFrame(10000, 100, 0, 60, 600), 599);
  assert.equal(pointerFrame(300, 100, 0, 60, 0), 0);
  assert.equal(edgeScrollSpeed(300, 100, 500), 0);
  assert.ok(edgeScrollSpeed(110, 100, 500) < 0); assert.ok(edgeScrollSpeed(490, 100, 500) > 0);
});
