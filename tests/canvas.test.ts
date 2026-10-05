import test from 'node:test';
import assert from 'node:assert/strict';
import { CANVAS_PRESETS, CanvasSettingsSchema, DEFAULT_FRAMING, FramingSchema, canvasSettings, framingGeometry, framingStyle } from '../src/shared/canvas';
import { addMedia, commit, newProject, ProjectSchema, redo, split, undo, type Media } from '../src/shared/project';

const media: Media = { id: crypto.randomUUID(), path: 'C:\\portrait.mp4', name: 'portrait.mp4', fingerprint: 'canvas', durationFrames: 90, width: 1080, height: 1920, displayWidth: 1080, displayHeight: 1920, codec: 'h264', sourceFps: 30, timeBase: '1/30', startTime: 0, rotation: 0, hasAudio: true, warnings: [] };
test('new projects are portrait; legacy wide projects retain framing and migrate to v7', () => {
  assert.equal(newProject().settings.height, 1920);
  const old = addMedia(newProject('16:9'), [media]);
  const input = { ...old, version: 2, settings: { width: 1920, height: 1080, fps: 30, color: 'SDR' }, clips: old.clips.map(({ framing: _, ...c }) => c) };
  const migrated = ProjectSchema.parse(input);
  assert.equal(migrated.version, 7); assert.deepEqual(migrated.settings, canvasSettings('16:9'));
  assert.deepEqual(migrated.clips[0].framing, DEFAULT_FRAMING);
  assert.equal(migrated.clips[0].outFrame, 90);
});
test('all presets validate; arbitrary sizes, fit values and filter injection are rejected', () => {
  for (const preset of CANVAS_PRESETS) assert.doesNotThrow(() => CanvasSettingsSchema.parse(canvasSettings(preset.id)));
  assert.throws(() => CanvasSettingsSchema.parse({ ...canvasSettings('9:16'), height: 1919 }));
  assert.throws(() => CanvasSettingsSchema.parse({ ...canvasSettings('9:16'), background: "black;movie=x" }));
  assert.throws(() => CanvasSettingsSchema.parse({ ...canvasSettings('9:16'), fit: 'stretch' }));
  assert.throws(() => FramingSchema.parse({ fit: 'cover', x: 101, y: 50 }));
});
test('fit preserves the whole source; fill crops with bounded even offsets across all aspect pairs', () => {
  for (const source of CANVAS_PRESETS) for (const target of CANVAS_PRESETS) for (const fit of ['contain', 'cover'] as const) {
    const settings = { ...canvasSettings(target.id), fit };
    const g = framingGeometry(source.width, source.height, settings, DEFAULT_FRAMING);
    assert.ok(g.width <= settings.width && g.height <= settings.height);
    assert.ok(g.cropX >= 0 && g.cropX + g.cropWidth <= source.width);
    assert.ok(g.cropY >= 0 && g.cropY + g.cropHeight <= source.height);
    assert.ok([g.width, g.height, g.cropWidth, g.cropHeight, g.cropX, g.cropY, g.left, g.top].every(n => n % 2 === 0));
    if (fit === 'contain') { assert.equal(g.cropWidth, source.width); assert.equal(g.cropHeight, source.height); }
    else { assert.equal(g.width, settings.width); assert.equal(g.height, settings.height); }
  }
  const settings = canvasSettings('9:16');
  const left = framingGeometry(1920, 1080, settings, { fit: 'cover', x: 0, y: 50 });
  const right = framingGeometry(1920, 1080, settings, { fit: 'cover', x: 100, y: 50 });
  assert.equal(left.cropX, 0); assert.equal(right.cropX + right.cropWidth, 1920);
  assert.equal(framingStyle(1920, 1080, settings, { fit: 'cover', x: 0, y: 50 }).left, '0%');
});
test('canvas/clip framing survive split, undo/redo and save roundtrip independently', () => {
  const p = addMedia(newProject(), [media, media]);
  p.clips[0].framing = { fit: 'cover', x: 15, y: 90 };
  const changed = { ...p, settings: { ...canvasSettings('1:1'), background: '#ffffff' } };
  const h = commit({ past: [], present: p, future: [] }, changed);
  assert.deepEqual(undo(h).present, p); assert.deepEqual(redo(undo(h)).present, changed);
  const divided = split(changed, p.clips[0].id, 30);
  assert.deepEqual(divided.clips[1].framing, p.clips[0].framing);
  assert.deepEqual(divided.clips[2].framing, DEFAULT_FRAMING);
  assert.deepEqual(ProjectSchema.parse(JSON.parse(JSON.stringify(divided))), divided);
});
