import test from 'node:test';
import assert from 'node:assert/strict';
import { addMedia, commit, duration, finishPreview, locate, newProject, redo, trim, undo, type History, type Media } from '../src/shared/project';
import { trimFromDrag } from '../src/shared/timeline';

const media = (): Media => ({ id: crypto.randomUUID(), path: 'C:\\영상.mp4', name: '영상.mp4', fingerprint: 'trim-test', durationFrames: 120, width: 640, height: 360, codec: 'h264', sourceFps: 30, timeBase: '1/30', startTime: 0, rotation: 0, hasAudio: true, warnings: [] });
test('drag trims in whole frames, extends within source and retains one frame', () => {
  const clip = { inFrame: 15, outFrame: 90 };
  assert.deepEqual(trimFromDrag(clip, 'start', 15.4, 120), { inFrame: 30, outFrame: 90 });
  assert.deepEqual(trimFromDrag(clip, 'start', -200, 120), { inFrame: 0, outFrame: 90 });
  assert.deepEqual(trimFromDrag(clip, 'start', 200, 120), { inFrame: 89, outFrame: 90 });
  assert.deepEqual(trimFromDrag(clip, 'end', 200, 120), { inFrame: 15, outFrame: 120 });
  assert.deepEqual(trimFromDrag(clip, 'end', -200, 120), { inFrame: 15, outFrame: 16 });
  assert.deepEqual(trimFromDrag(clip, 'end', 0, 120), clip);
});
test('trim ripples the next clip with source mapping, audio and correction intact', () => {
  const original = addMedia(newProject(), [media(), media()]);
  original.clips[0].color.brightness = 23; original.clips[0].volume = 0.35;
  const next = trim(original, original.clips[0].id, 15, 90);
  assert.equal(duration(next), 195);
  assert.equal(locate(next, 0)?.sourceFrame, 15);
  assert.equal(locate(next, 74)?.sourceFrame, 89);
  assert.equal(locate(next, 75)?.clip.id, original.clips[1].id);
  assert.equal(locate(next, 75)?.sourceFrame, 0);
  assert.deepEqual(next.clips[1], original.clips[1]);
  assert.equal(next.clips[0].volume, 0.35); assert.equal(next.clips[0].color.brightness, 23);
  assert.equal(original.clips[0].inFrame, 0);
});
test('a continuous drag is one undo; cancel and return-to-origin preserve redo', () => {
  const original = addMedia(newProject(), [media()]);
  const initial: History = { past: [], present: original, future: [] };
  const before = undo(commit(initial, trim(original, original.clips[0].id, 0, 80)));
  let preview = original;
  for (let frame = 119; frame >= 60; frame--) preview = trim(preview, original.clips[0].id, 0, frame);
  const done = finishPreview(before, preview);
  assert.equal(done.past.length, 1); assert.equal(done.future.length, 0);
  assert.deepEqual(undo(done).present, original); assert.deepEqual(redo(undo(done)).present, preview);
  assert.equal(finishPreview(before, preview, true), before);
  assert.equal(finishPreview(before, trim(preview, original.clips[0].id, 0, 120)), before);
  assert.equal(trim(original, original.clips[0].id, 0, 120), original);
});
