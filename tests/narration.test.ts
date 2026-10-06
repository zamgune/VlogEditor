import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { newProject, ProjectSchema, commit, undo, redo, type History } from '../src/shared/project';
import { NarrationSchema, audibleNarrations, narrationRows, narrationFilter, type Narration } from '../src/shared/narration';
import { audioHash } from '../electron/narration';
import { atomicSave, readProject, withPortableNarrations } from '../electron/storage';
const take = (patch: Partial<Narration> = {}): Narration => ({ id: crypto.randomUUID(), name: '음성 1', path: 'C:/voice.wav', fingerprint: 'a'.repeat(64), durationFrames: 120, startFrame: 30, inFrame: 0, outFrame: 120, volume: .7, muted: false, ...patch });
test('legacy projects gain an empty voice track and recordings round-trip through undo/redo', () => {
  const { narrations: _, ...old } = newProject();
  for (const version of [1, 2, 3, 4, 5]) { const p = ProjectSchema.parse({ ...old, version }); assert.equal(p.version, 8); assert.deepEqual(p.narrations, []); }
  const original = newProject(), next = { ...original, narrations: [take()] };
  const history: History = { past: [], present: original, future: [] };
  assert.deepEqual(redo(undo(commit(history, ProjectSchema.parse(next)))).present.narrations, next.narrations);
  assert.throws(() => ProjectSchema.parse({ ...next, narrations: [next.narrations[0], next.narrations[0]] }));
  for (const patch of [{ inFrame: 120 }, { outFrame: 121 }, { startFrame: -1 }, { volume: 2 }]) assert.equal(NarrationSchema.safeParse(take(patch)).success, false);
});
test('voice intervals retain timing, respect muted/outside tracks and mix using exact 48 kHz samples', () => {
  const n = take({ startFrame: 45, inFrame: 15, outFrame: 75 });
  assert.equal(narrationFilter(n, 2, 90, 'voice0'), '[2:a]atrim=start_sample=24000:end_sample=96000,asetpts=PTS-STARTPTS,volume=0.7,aformat=sample_rates=48000:channel_layouts=stereo,adelay=72000S:all=1[voice0]');
  assert.deepEqual(audibleNarrations([n, take({ muted: true }), take({ volume: 0 }), take({ startFrame: 90 })], 90), [n]);
  const later = take({ startFrame: 105, outFrame: 15 }), overlap = take({ startFrame: 60 });
  assert.deepEqual(narrationRows([later, overlap, n], 150), [[n, later], [overlap]]);
});
test('saved narration travels beside the project and missing or modified audio is rejected', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vlog-voice-'));
  try {
    const source = join(dir, 'original.wav'); await writeFile(source, Buffer.from('RIFF-fixture-voice'));
    const p = { ...newProject(), narrations: [take({ path: source, fingerprint: await audioHash(source) })] };
    const path = join(dir, '목소리.vlog.json'); await atomicSave(path, await withPortableNarrations(path, p));
    const moved = join(dir, 'moved'); await mkdir(moved);
    await cp(path, join(moved, '목소리.vlog.json')); await cp(`${path}.assets`, join(moved, '목소리.vlog.json.assets'), { recursive: true });
    const reopened = await readProject(join(moved, '목소리.vlog.json'));
    assert.ok(reopened.narrations[0].path.startsWith(moved)); assert.equal(await audioHash(reopened.narrations[0].path), p.narrations[0].fingerprint);
    await atomicSave(join(moved, '목소리.vlog.json'), await withPortableNarrations(join(moved, '목소리.vlog.json'), reopened));
    assert.equal((await readProject(join(moved, '목소리.vlog.json'))).narrations[0].fingerprint, p.narrations[0].fingerprint);
    await writeFile(source, 'changed'); await assert.rejects(withPortableNarrations(path, p), /변경/);
    await rm(source); await assert.rejects(withPortableNarrations(path, p));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
