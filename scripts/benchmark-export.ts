import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { MediaEngine, probe } from '../electron/media';
import { binPath, run } from '../electron/process';
import { addMedia, newProject, trim } from '../src/shared/project';

const root = resolve('.'), dir = join(root, 'artifacts', 'export-benchmark');
await mkdir(dir, { recursive: true });
const source = join(dir, 'source.mp4'), ffmpeg = binPath(root, 'ffmpeg');
try { await readFile(source); } catch {
  await run(ffmpeg, ['-hide_banner', '-v', 'error', '-n', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=60', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=60', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24', '-threads', '6', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', source]);
}
const engine = new MediaEngine(root, join(dir, 'cache'));
const media = await engine.import(source);
let base = addMedia(newProject('16:9'), [media, media]);
base = trim(base, base.clips[0].id, 1349, 1469);
base = trim(base, base.clips[1].id, 943, 1063);
const label = process.argv[2] ?? `run-${Date.now()}`;
const results = [];
for (const name of ['neutral', 'color']) {
  const project = structuredClone(base);
  if (name === 'color') project.clips.forEach(c => { c.color = { brightness: 15, contrast: 20, saturation: -20, warmth: 10 }; });
  const output = join(dir, `${label}-${name}.mp4`), events: { elapsed: number; percent: number }[] = [];
  const started = performance.now();
  await engine.export(project, output, undefined, percent => events.push({ elapsed: performance.now() - started, percent }));
  const seconds = (performance.now() - started) / 1000, info = await probe(root, output);
  results.push({ name, seconds, output, frames: info.streams.find(s => s.codec_type === 'video')?.nb_frames, events });
  console.log(JSON.stringify({ name, seconds, output }));
}
await writeFile(join(dir, `${label}.json`), JSON.stringify(results, null, 2));
