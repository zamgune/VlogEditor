import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { MediaEngine, probe } from '../electron/media';
import { run, binPath } from '../electron/process';
import { addMedia, newProject, trim } from '../src/shared/project';
import { CANVAS_PRESETS, DEFAULT_FRAMING, canvasSettings } from '../src/shared/canvas';
import { atomicSave, readProject } from '../electron/storage';

const root = resolve('.'), ffmpeg = binPath(root, 'ffmpeg');
const dir = join(root, 'artifacts', `화면 비율 검증 ${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(dir, { recursive: true });
const wide = join(dir, '가로 삼색.mp4'), tall = join(dir, '세로 삼색.mp4'), rotated = join(dir, '회전 메타데이터.mov'), sar = join(dir, '비정방 픽셀.mp4');
const create = async (path: string, size: string, filter: string) => run(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', `color=c=red:s=${size}:r=30:d=1`, '-vf', filter, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path]);
await create(wide, '640x360', 'drawbox=x=iw/3:y=0:w=iw/3:h=ih:color=lime:t=fill,drawbox=x=2*iw/3:y=0:w=iw/3:h=ih:color=blue:t=fill');
await create(tall, '360x640', 'drawbox=x=0:y=ih/3:w=iw:h=ih/3:color=lime:t=fill,drawbox=x=0:y=2*ih/3:w=iw:h=ih/3:color=blue:t=fill');
await run(ffmpeg, ['-v', 'error', '-display_rotation', '90', '-i', wide, '-c', 'copy', rotated]);
await create(sar, '320x240', 'setsar=2');
const files = [wide, tall, rotated, sar], hashes = await Promise.all(files.map(async f => createHash('sha256').update(await readFile(f)).digest('hex')));
const engine = new MediaEngine(root, join(dir, 'cache'));
const a = await engine.import(wide), b = await engine.import(tall), r = await engine.import(rotated), s = await engine.import(sar);
assert.deepEqual([a.displayWidth, a.displayHeight], [1920, 1080]);
assert.deepEqual([b.displayWidth, b.displayHeight], [1080, 1920]);
assert.deepEqual([r.displayWidth, r.displayHeight], [1080, 1920]);
assert.deepEqual([s.displayWidth, s.displayHeight], [1920, 720]);
async function rgb(file: string, frame: number, width: number, height: number) {
  return (await run(ffmpeg, ['-v', 'error', '-i', file, '-vf', `select=eq(n\\,${frame}),scale=${width}:${height},format=rgb24`, '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'])).stdout;
}
async function pixel(file: string, frame: number, x: number, y: number) {
  return Array.from((await run(ffmpeg, ['-v', 'error', '-i', file, '-vf', `select=eq(n\\,${frame}),format=rgb24,crop=1:1:${x}:${y}`, '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'])).stdout);
}
const outputs: { ratio: string; fit: string; file: string; size: number[]; previewError: number[] }[] = [];
for (const preset of CANVAS_PRESETS) for (const fit of ['contain', 'cover'] as const) {
  let p = addMedia(newProject(preset.id), [a, b]);
  p.settings.fit = fit; p.settings.background = '#ffffff';
  p = trim(p, p.clips[0].id, 0, 15); p = trim(p, p.clips[1].id, 0, 15);
  const file = join(dir, `${preset.id.replace(':', '-')}-${fit}.mp4`); await engine.export(p, file);
  const info = await probe(root, file), v = info.streams.find(s => s.codec_type === 'video')!;
  assert.deepEqual([v.width, v.height, Number(v.nb_frames)], [preset.width, preset.height, 30]);
  const errors: number[] = [];
  for (const [index, media] of [a, b].entries()) {
    const still = await engine.still(media.id, 0, undefined, undefined, p.settings, p.clips[index].framing);
    const image = join(dir, `${preset.id.replace(':', '-')}-${fit}-${index}.png`); await writeFile(image, Buffer.from(still.split(',')[1], 'base64'));
    const [reference, output] = await Promise.all([rgb(image, 0, preset.width / 2, preset.height / 2), rgb(file, index * 15, preset.width / 2, preset.height / 2)]);
    assert.equal(reference.length, output.length);
    const error = reference.reduce((sum, value, i) => sum + Math.abs(value - output[i]), 0) / reference.length;
    assert.ok(error < 3, `${preset.id}/${fit}/${index} preview error ${error}`); errors.push(error);
  }
  if (preset.id === '9:16' && fit === 'contain') assert.ok((await pixel(file, 0, 540, 100)).every(v => v > 245));
  if (preset.id === '9:16' && fit === 'cover') { const center = await pixel(file, 0, 540, 960); assert.ok(center[1] > 220 && center[0] < 20 && center[2] < 20); }
  outputs.push({ ratio: preset.id, fit, file, size: [v.width!, v.height!], previewError: errors });
}
let positions = addMedia(newProject(), [a, a, a, r, s]);
positions.settings.fit = 'cover'; positions.settings.background = '#ffffff';
positions.clips.forEach((clip, i) => { clip.outFrame = 15; clip.framing = { fit: i === 4 ? 'contain' : 'cover', x: [0, 50, 100, 50, 50][i], y: 50 }; });
const output = join(dir, '채우기 위치와 영상별 여백.mp4'); await engine.export(positions, output);
const positionPixels = [await pixel(output, 0, 540, 960), await pixel(output, 15, 540, 960), await pixel(output, 30, 540, 960)];
assert.ok(positionPixels[0][0] > 220 && positionPixels[1][1] > 220 && positionPixels[2][2] > 220);
assert.ok((await pixel(output, 60, 540, 100)).every(v => v > 245));
const saved = join(dir, '비율 프로젝트.vlog.json'); await atomicSave(saved, positions); assert.deepEqual(await readProject(saved), positions);
assert.deepEqual(await Promise.all(files.map(async f => createHash('sha256').update(await readFile(f)).digest('hex'))), hashes);
const report = { verifiedAt: new Date().toISOString(), dir, sourceFiles: files, outputs, positionPixels, saved, output,
  checks: ['6 ratios x fit/fill', 'mixed landscape/portrait clips', 'all output sizes and frame counts', '24 still/export full-frame comparisons <3 mean RGB error', 'white letterbox vs center crop pixels', 'left/center/right crop pixels', 'per clip fit override', 'rotation metadata and non-square pixels normalized', 'save roundtrip', 'source hashes unchanged'] };
await writeFile(join(dir, 'report.json'), JSON.stringify(report, null, 2));
await writeFile(join(root, 'artifacts/latest-canvas.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
