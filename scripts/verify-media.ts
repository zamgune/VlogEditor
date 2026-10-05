import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { MediaEngine, probe } from '../electron/media';
import { binPath, run } from '../electron/process';
import { atomicSave, readProject } from '../electron/storage';
import { addMedia, newProject, trim } from '../src/shared/project';

const root = resolve('.');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const dir = join(root, 'artifacts', `검증 결과 ${runId}`);
await mkdir(dir, { recursive: true });
const ffmpeg = binPath(root, 'ffmpeg');
const first = join(dir, '빨강 장면 24fps.mp4');
const second = join(dir, '파랑 세로 60fps.mov');
const silent = join(dir, '무음 장면.mp4');
const base = ['-hide_banner', '-v', 'error', '-nostdin', '-n'];
await run(ffmpeg, [...base, '-f', 'lavfi', '-i', 'color=c=red:s=640x360:r=24:d=4', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=4',
  '-vf', "drawbox=x=0:y=0:w=iw/2:h=ih/2:color=yellow:t=fill:enable='gte(t,2)'", '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', first]);
await run(ffmpeg, [...base, '-f', 'lavfi', '-i', 'color=c=blue:s=360x640:r=60:d=4', '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000:duration=4',
  '-vf', "drawbox=x=0:y=0:w=iw/2:h=ih/2:color=lime:t=fill:enable='gte(t,1)'", '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', second]);
await run(ffmpeg, [...base, '-f', 'lavfi', '-i', 'color=c=green:s=320x240:r=30:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', silent]);
const hash = async (p: string) => createHash('sha256').update(await readFile(p)).digest('hex');
const sourceHashes = await Promise.all([hash(first), hash(second), hash(silent)]);
const engine = new MediaEngine(root, join(dir, '편집용 캐시'));
const a = await engine.import(first); const b = await engine.import(second); const s = await engine.import(silent);
assert.equal(a.durationFrames, 120); assert.equal(b.durationFrames, 120); assert.equal(s.hasAudio, false);
let project = addMedia({ ...newProject('16:9'), name: '첫 컷 출력 검증' }, [a, b]);
project = trim(project, project.clips[0].id, 30, 75);
project = trim(project, project.clips[1].id, 15, 90);
const projectPath = join(dir, '첫 편집 프로젝트.vlog.json');
await atomicSave(projectPath, project);
assert.deepEqual(await readProject(projectPath), project);
const output = join(dir, '첫 출력 검증.mp4');
const progresses: number[] = [];
await engine.export(project, output, undefined, p => progresses.push(p));
assert.equal(progresses.at(-1), 100);
const info = await probe(root, output);
const v = info.streams.find(s => s.codec_type === 'video')!;
const audioInfo = info.streams.find(s => s.codec_type === 'audio')!;
assert.equal(Number(v.nb_frames), 120); assert.equal(v.avg_frame_rate, '30/1');
assert.equal(v.width, 1920); assert.equal(v.height, 1080); assert.equal(v.codec_name, 'h264'); assert.equal(audioInfo.codec_name, 'aac');
assert.ok(Math.abs(Number(audioInfo.duration) - 4) < 0.04, `Audio duration ${audioInfo.duration}`);
async function pixel(frame: number, x: number, y: number, input = output) {
  const result = await run(ffmpeg, ['-hide_banner', '-v', 'error', '-i', input, '-vf', `select=eq(n\\,${frame}),format=rgb24,crop=1:1:${x}:${y}`, '-frames:v', '1', '-f', 'rawvideo', 'pipe:1']);
  assert.equal(result.stdout.length, 3); return Array.from(result.stdout);
}
const pixels = { beforeCut: await pixel(44, 960, 900), atCut: await pixel(45, 960, 900), beforeRedMarker: await pixel(29, 800, 200), atRedMarker: await pixel(30, 800, 200), beforeBlueMarker: await pixel(59, 800, 200), atBlueMarker: await pixel(60, 800, 200), portraitLetterbox: await pixel(45, 20, 500) };
assert.ok(pixels.beforeCut[0] > 220 && pixels.beforeCut[2] < 20);
assert.ok(pixels.atCut[2] > 220 && pixels.atCut[0] < 20);
assert.ok(pixels.beforeRedMarker[1] < 20 && pixels.atRedMarker[1] > 220, 'first source trim timestamp');
assert.ok(pixels.beforeBlueMarker[2] > 220 && pixels.atBlueMarker[1] > 220, 'second source trim timestamp');
assert.ok(pixels.portraitLetterbox.every(n => n < 8));
const samples = await run(ffmpeg, ['-v', 'error', '-i', output, '-vn', '-ar', '48000', '-ac', '1', '-f', 'f32le', 'pipe:1']);
const pcm = samples.stdout;
function frequency(start: number, seconds: number) {
  let crossings = 0; const firstSample = Math.floor(start * 48000); const count = Math.floor(seconds * 48000);
  for (let i = firstSample + 1; i < firstSample + count; i++) if (pcm.readFloatLE((i - 1) * 4) <= 0 && pcm.readFloatLE(i * 4) > 0) crossings++;
  return crossings / seconds;
}
const frequencies = [frequency(0.3, 0.5), frequency(1.8, 0.5)];
assert.ok(Math.abs(frequencies[0] - 440) < 4); assert.ok(Math.abs(frequencies[1] - 880) < 4);
const still = await engine.still(b.id, 15); await writeFile(join(dir, '정지 프레임.png'), Buffer.from(still.split(',')[1], 'base64'));
await run(ffmpeg, ['-v', 'error', '-i', output, '-vf', 'select=eq(n\\,45),scale=960:540', '-frames:v', '1', join(dir, '출력 컷 프레임.png')]);
const previewPixels = (await run(ffmpeg, ['-v', 'error', '-i', join(dir, '정지 프레임.png'), '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'])).stdout;
const outputPixels = (await run(ffmpeg, ['-v', 'error', '-i', join(dir, '출력 컷 프레임.png'), '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'])).stdout;
assert.equal(previewPixels.length, outputPixels.length);
const previewOutputMeanError = previewPixels.reduce((sum, value, i) => sum + Math.abs(value - outputPixels[i]), 0) / previewPixels.length;
assert.ok(previewOutputMeanError < 2, `Preview/output pixel mean error ${previewOutputMeanError}`);
const silentOutput = join(dir, '무음 입력 출력.mp4'); await engine.export(addMedia(newProject('16:9'), [s]), silentOutput);
const aborted = new AbortController(); const cancelled = join(dir, '취소된 출력.mp4');
const cancellation = engine.export(project, cancelled, aborted.signal, () => aborted.abort());
setTimeout(() => aborted.abort(), 400);
await assert.rejects(cancellation, /취소/); await assert.rejects(stat(cancelled), /ENOENT/);
await assert.rejects(engine.export(project, first), /원본/);
await assert.rejects(engine.export(project, output), /존재/);
await assert.rejects(engine.export(project, join(dir, '존재하지 않는 폴더', '실패.mp4')), /실패/);
assert.deepEqual(await Promise.all([hash(first), hash(second), hash(silent)]), sourceHashes);
assert.ok(!(await readdir(dir)).some(p => p.endsWith('.partial.mp4')));
const report = { verifiedAt: new Date().toISOString(), platform: process.platform, arch: process.arch, node: process.version,
  output, projectPath, sourceHashes, sourceFiles: [first, second, silent], frames: Number(v.nb_frames), videoDuration: v.duration,
  audioDuration: audioInfo.duration, videoCodec: v.codec_name, audioCodec: audioInfo.codec_name, pixels, frequencies, previewOutputMeanError,
  checks: ['Korean and space paths', '24/60 fps normalized to 30', 'two trimmed source segments', '120 exact frames', 'cut at frame 45', 'source-time markers at frames 30 and 60', 'portrait fit', 'audio frequency switches', 'silent input', 'source SHA256 unchanged', 'save/reopen JSON', 'cancel cleanup', 'export error cleanup', 'refuse original/existing destination', 'FFmpeg still preview vs output pixels'],
  unverified: ['real camera footage', 'HDR', 'VFR camera timestamps', 'subtitles', 'moving mosaic', 'microphone', 'automatic face detection'] };
await writeFile(join(dir, 'report.json'), JSON.stringify(report, null, 2));
await writeFile(join(root, 'artifacts', 'latest-media.json'), JSON.stringify({ dir, output, projectPath, sourceFiles: [first, second, silent] }, null, 2));
console.log(JSON.stringify(report, null, 2));
