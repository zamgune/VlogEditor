import test from 'node:test';
import assert from 'node:assert/strict';
import { reorderTarget } from '../src/shared/timeline';
import { addMedia, commit, duration, locate, moveClip, newProject, redo, undo, type History, type Media } from '../src/shared/project';

test('insertion boundaries handle both directions, unequal lengths and original position', () => {
  const clips = [{ inFrame: 10, outFrame: 70 }, { inFrame: 0, outFrame: 120 }, { inFrame: 60, outFrame: 90 }];
  assert.deepEqual(reorderTarget(clips, 0, 140), { to: 1, boundary: 180 });
  assert.deepEqual(reorderTarget(clips, 0, 205), { to: 2, boundary: 210 });
  assert.deepEqual(reorderTarget(clips, 2, -20), { to: 0, boundary: 0 });
  assert.deepEqual(reorderTarget(clips, 2, 80), { to: 1, boundary: 60 });
  assert.equal(reorderTarget(clips, 1, 80).to, 1);
  assert.equal(reorderTarget(clips, 1, 150).to, 1);
  assert.deepEqual(reorderTarget(clips, 1, 900), { to: 2, boundary: 210 });
});

test('moving retains clip ranges, correction, audio and total duration through undo/redo', () => {
  const asset: Media = { id: crypto.randomUUID(), name: 'move.mp4', path: 'C:\\move.mp4', fingerprint: 'move', durationFrames: 120, width: 640, height: 360, codec: 'h264', sourceFps: 30, timeBase: '1/30', startTime: 0, rotation: 0, hasAudio: true, warnings: [] };
  const p = addMedia(newProject(), [asset, asset, asset]);
  p.clips[0].inFrame = 30; p.clips[0].outFrame = 75; p.clips[0].volume = 0.4; p.clips[0].color.brightness = 12;
  const initial: History = { past: [], present: p, future: [] };
  const moved = moveClip(p, 0, 2), history = commit(initial, moved);
  assert.deepEqual(moved.clips, [p.clips[1], p.clips[2], p.clips[0]]);
  assert.equal(duration(moved), duration(p)); assert.equal(locate(moved, 240)?.sourceFrame, 30);
  assert.equal(history.past.length, 1); assert.deepEqual(undo(history).present, p);
  assert.deepEqual(redo(undo(history)).present, moved);
  const beforeNoop = undo(history);
  assert.equal(commit(beforeNoop, moveClip(beforeNoop.present, 0, 0)), beforeNoop);
});
