import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { MediaEngine } from '../electron/media';
import { binPath, run } from '../electron/process';
import { addMedia, newProject, trim } from '../src/shared/project';
import { colorMatrix, NEUTRAL_COLOR } from '../src/shared/color';
import { atomicSave, readProject } from '../electron/storage';

const root = resolve('.');
const dir = join(root, 'artifacts', `색 보정 검증 ${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(dir, { recursive: true });
const ffmpeg = binPath(root, 'ffmpeg');
const input = join(dir, '색상 테스트.mp4');
await run(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x7890a8:s=640x360:r=30:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', input]);
const engine = new MediaEngine(root, join(dir, 'cache'));
const media = await engine.import(input);
let project = addMedia(newProject('16:9'), [media, media]);
project = trim(project, project.clips[0].id, 0, 15); project = trim(project, project.clips[1].id, 0, 15);
project.clips[0].color = { brightness: 25, contrast: 20, saturation: -50, warmth: 40 };
const saved = join(dir, '보정 프로젝트.vlog.json'); await atomicSave(saved, project); project = await readProject(saved);
const output = join(dir, '보정 출력.mp4'); await engine.export(project, output);
async function pixel(file: string, frame: number) {
  const data = await run(ffmpeg, ['-v', 'error', '-i', file, '-vf', `select=eq(n\\,${frame}),format=rgb24,crop=1:1:100:100`, '-frames:v', '1', '-f', 'rawvideo', 'pipe:1']);
  return Array.from(data.stdout);
}
const corrected = await pixel(output, 0), neutral = await pixel(output, 15);
const matrix = colorMatrix(project.clips[0].color);
const expected = [0, 1, 2].map(row => Math.min(255, Math.max(0, neutral.reduce((sum, value, column) => sum + value * matrix[row * 5 + column], 255 * matrix[row * 5 + 4]))));
assert.ok(corrected.every((value, i) => Math.abs(value - expected[i]) <= 4), JSON.stringify({ corrected, neutral, expected }));
assert.ok(corrected[0] > neutral[0] + 20);
const still = await engine.still(media.id, 0, project.clips[0].color);
const stillPath = join(dir, '보정 정지 미리보기.png'); await writeFile(stillPath, Buffer.from(still.split(',')[1], 'base64'));
const stillPixel = await pixel(stillPath, 0);
assert.ok(stillPixel.every((value, i) => Math.abs(value - corrected[i]) <= 3));
const gray = await engine.still(media.id, 0, { ...NEUTRAL_COLOR, saturation: -100 });
const grayPath = join(dir, '흑백 미리보기.png'); await writeFile(grayPath, Buffer.from(gray.split(',')[1], 'base64'));
const grayPixel = await pixel(grayPath, 0); assert.ok(Math.max(...grayPixel) - Math.min(...grayPixel) <= 1);
const report = { output, saved, corrected, neutral, expected, stillPixel, grayPixel,
  checks: ['same source different clip corrections', 'shared matrix expected pixels within 4/255', 'still vs export within 3/255', 'saturation -100 is grayscale', 'save/reopen color values'] };
await writeFile(join(dir, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
