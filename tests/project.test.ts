import test from 'node:test';
import assert from 'node:assert/strict';
import { addMedia, commit, duration, locate, moveClip, newProject, ProjectSchema, redo, removeClip, split, trim, undo, type Media } from '../src/shared/project';
const asset = (frames = 90): Media => ({ id: crypto.randomUUID(), path: 'C:\\테스트 폴더\\촬영.mp4', name: '촬영.mp4', fingerprint: 'test', durationFrames: frames, width: 1280, height: 720, codec: 'h264', sourceFps: 30, timeBase: '1/15360', startTime: 0, rotation: 90, hasAudio: true, warnings: [] });
test('split uses half-open frame intervals; duration and source continuity survive', () => {
  const p = addMedia(newProject(), [asset()]); const next = split(p, p.clips[0].id, 31);
  assert.deepEqual(next.clips.map(c => [c.inFrame, c.outFrame]), [[0, 31], [31, 90]]);
  assert.equal(duration(next), 90); assert.equal(locate(next, 31)?.sourceFrame, 31);
  assert.equal(locate(next, 90), undefined); assert.equal(split(p, p.clips[0].id, 0), p);
});
test('trim, reorder and ripple deletion preserve media references and mapping', () => {
  let p = addMedia(newProject(), [asset(100), asset(70)]);
  const original = structuredClone(p);
  p = trim(p, p.clips[0].id, 10, 50); assert.equal(duration(p), 110);
  assert.equal(locate(p, 39)?.sourceFrame, 49); assert.equal(locate(p, 40)?.sourceFrame, 0);
  p = moveClip(p, 1, 0); assert.equal(locate(p, 70)?.sourceFrame, 10);
  p = removeClip(p, p.clips[0].id); assert.equal(locate(p, 0)?.sourceFrame, 10);
  assert.equal(duration(p), 40); assert.equal(original.clips[0].inFrame, 0);
});
test('schema rejects fractional time, broken references, invalid trim and future version', () => {
  const p = addMedia(newProject(), [asset()]);
  assert.throws(() => trim(p, p.clips[0].id, 0.5, 60));
  assert.throws(() => trim(p, p.clips[0].id, 20, 20));
  assert.throws(() => trim(p, p.clips[0].id, 0, 91));
  assert.throws(() => ProjectSchema.parse({ ...p, media: [] }));
  assert.throws(() => ProjectSchema.parse({ ...p, version: 99 }));
  assert.deepEqual(ProjectSchema.parse(JSON.parse(JSON.stringify(p))), p);
});
test('undo/redo preserve complete snapshots and a new edit clears redo', () => {
  const p = addMedia(newProject(), [asset()]); let h = { past: [], present: p, future: [] } as Parameters<typeof commit>[0];
  const trimmed = trim(p, p.clips[0].id, 12, 60); h = commit(h, trimmed);
  h = undo(h); assert.deepEqual(h.present, p); h = redo(h); assert.deepEqual(h.present, trimmed);
  h = commit(undo(h), removeClip(p, p.clips[0].id)); assert.equal(h.future.length, 0);
});
