import test from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from '../electron/media';
import { progressReader } from '../electron/process';
import { atomicSave, readProject } from '../electron/storage';
import { newProject } from '../src/shared/project';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
const probe = () => ({ format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '3' }, streams: [{ codec_type: 'video', codec_name: 'h264', width: 1080, height: 1920, pix_fmt: 'yuv420p', color_transfer: 'bt709' }] });
test('probe policy checks actual container, HDR/bit depth and video stream', () => {
  assert.equal(inspect(probe()).seconds, 3);
  assert.throws(() => inspect({ ...probe(), format: { format_name: 'matroska', duration: '3' } }));
  const hdr = probe(); hdr.streams[0].color_transfer = 'smpte2084'; assert.throws(() => inspect(hdr), /HDR/);
  const high = probe(); high.streams[0].pix_fmt = 'yuv420p10le'; assert.throws(() => inspect(high), /10비트/);
  assert.throws(() => inspect({ ...probe(), streams: [] }), /영상 스트림/);
});
test('progress reader handles arbitrary process chunk boundaries', () => {
  const p: number[] = []; const reader = progressReader(100, n => p.push(n));
  reader('fra'); reader('me=10\nfps=30\nframe='); reader('50\nframe=100\n');
  assert.deepEqual(p, [10, 50, 99]);
});
test('atomic project save round trips Korean/spaces and keeps previous successful save', async () => {
  const dir = await mkdtemp(join(tmpdir(), '브이로그 저장 '));
  try { const path = join(dir, '한글 프로젝트.vlog.json'); const p = newProject(); await atomicSave(path, p);
    const changed = { ...p, name: '변경된 이름' }; await atomicSave(path, changed);
    assert.deepEqual(await readProject(path), changed); assert.deepEqual(await readProject(`${path}.bak`), p);
  } finally {
    if (!resolve(dir).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unexpected test cleanup path');
    await rm(dir, { recursive: true, force: true });
  }
});
