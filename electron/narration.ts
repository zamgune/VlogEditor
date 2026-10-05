import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rm, rename, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { MAX_RECORDING_FRAMES, NarrationSchema, type Narration } from '../src/shared/narration';
import { binPath, run } from './process';

export async function audioHash(path: string) {
  if (!/^[a-z]:[\\/]/i.test(path) || !path.toLowerCase().endsWith('.wav')) throw new Error('로컬 녹음 WAV 파일이 필요합니다.');
  const info = await stat(path);
  if (!info.isFile() || info.size > MAX_RECORDING_FRAMES * 3200 + 4096) throw new Error('녹음 파일 크기가 올바르지 않습니다.');
  return createHash('sha256').update(await readFile(path)).digest('hex');
}
export class NarrationStore {
  readonly assets = new Map<string, Narration>();
  constructor(private root: string, private directory: string) {}
  async save(value: unknown) {
    const input = z.object({ data: z.instanceof(Uint8Array).refine(b => b.byteLength > 0 && b.byteLength <= 64 * 1024 * 1024),
      frames: z.number().int().min(1).max(MAX_RECORDING_FRAMES), startFrame: z.number().int().min(0).max(30 * 60 * 60 * 24), name: z.string().min(1).max(200) }).strict().parse(value);
    const id = randomUUID(), raw = join(this.directory, `${id}.webm`), temp = join(this.directory, `${id}.partial.wav`), path = join(this.directory, `${id}.wav`);
    await mkdir(this.directory, { recursive: true });
    try {
      await writeFile(raw, input.data, { flag: 'wx' });
      await run(binPath(this.root, 'ffmpeg'), ['-hide_banner', '-nostdin', '-v', 'error', '-n', '-protocol_whitelist', 'file,pipe', '-f', 'webm', '-i', raw,
        '-map', '0:a:0', '-vn', '-af', `aresample=48000,apad,atrim=end_sample=${input.frames * 1600},asetpts=PTS-STARTPTS`,
        '-c:a', 'pcm_s16le', '-ac', '1', '-ar', '48000', '-map_metadata', '-1', temp]);
      await rename(temp, path);
      const narration = NarrationSchema.parse({ id, name: input.name, path, fingerprint: await audioHash(path), durationFrames: input.frames,
        startFrame: input.startFrame, inFrame: 0, outFrame: input.frames, volume: 1, muted: false });
      this.assets.set(id, narration); return narration;
    } finally { await rm(raw, { force: true }); await rm(temp, { force: true }); }
  }
  async register(n: Narration) {
    if (await audioHash(n.path) !== n.fingerprint) throw new Error(`녹음 파일이 변경되었습니다: ${n.name}`);
    this.assets.set(n.id, n);
  }
  async validate(takes: Narration[]) {
    for (const n of takes) {
      const asset = this.assets.get(n.id);
      if (!asset || resolve(asset.path) !== resolve(n.path) || asset.fingerprint !== n.fingerprint || asset.durationFrames !== n.durationFrames)
        throw new Error(`녹음 파일을 다시 열어 주세요: ${n.name}`);
      if (await audioHash(n.path) !== n.fingerprint) throw new Error(`녹음 파일이 변경되었습니다: ${n.name}`);
    }
  }
}
