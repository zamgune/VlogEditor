import { createHash, randomUUID } from 'node:crypto';
import { stat, mkdir, rename, rm, access, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, join, dirname, resolve } from 'node:path';
import { FPS, duration, ProjectSchema, type Media, type Project } from '../src/shared/project';
import { binPath, run, progressReader, CancelledError } from './process';
import { colorFilter, NEUTRAL_COLOR, type Color } from '../src/shared/color';
import { canvasSettings, DEFAULT_FRAMING, framingFilter, type CanvasSettings, type Framing } from '../src/shared/canvas';
import type { CaptionEngine } from './captions';
import type { NarrationStore } from './narration';
import { audibleNarrations, narrationFilter } from '../src/shared/narration';

type Stream = { codec_type: string; codec_name: string; width?: number; height?: number; avg_frame_rate?: string; r_frame_rate?: string; time_base?: string; start_time?: string; duration?: string; nb_frames?: string; color_transfer?: string; color_primaries?: string; color_space?: string; pix_fmt?: string; sample_aspect_ratio?: string; tags?: { rotate?: string }; side_data_list?: { rotation?: number }[] };
export type Probe = { streams: Stream[]; format: { duration?: string; format_name?: string; start_time?: string } };
export async function probe(root: string, path: string, signal?: AbortSignal): Promise<Probe> {
  const result = await run(binPath(root, 'ffprobe'), ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_streams', '-show_format', '-of', 'json', path], { signal });
  return JSON.parse(result.stdout.toString());
}
export const fraction = (s: string | undefined) => { const [n, d = '1'] = (s ?? '0/1').split('/'); return Number(d) ? Number(n) / Number(d) : 0; };
export function inspect(p: Probe) {
  const v = p.streams.find(s => s.codec_type === 'video');
  if (!v || !v.width || !v.height) throw new Error('영상 스트림이 없는 파일입니다. MP4/MOV 영상을 선택해 주세요.');
  if (!p.format.format_name?.split(',').some(n => ['mov', 'mp4', 'm4a', '3gp', '3g2', 'mj2'].includes(n))) throw new Error('첫 버전은 MP4/MOV 컨테이너만 지원합니다.');
  if (!['h264', 'hevc', 'mpeg4', 'prores', 'mjpeg', 'av1'].includes(v.codec_name)) throw new Error(`아직 검증 경로가 없는 영상 코덱입니다: ${v.codec_name}`);
  if (['smpte2084', 'arib-std-b67'].includes(v.color_transfer ?? '') || v.color_primaries === 'bt2020' || /10|12|16/.test(v.pix_fmt ?? '')) throw new Error('HDR / 광색역 / 10비트 이상 입력은 SDR 색 변환 검증 전까지 지원하지 않습니다. SDR 8비트 사본을 사용해 주세요.');
  const seconds = Number(v.duration ?? p.format.duration);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 4 * 3600) throw new Error('길이를 확인할 수 없거나 4시간을 초과한 영상입니다.');
  if (v.width > 4096 || v.height > 4096) throw new Error('첫 버전의 입력 해상도 한도는 각 변 4096px입니다.');
  return { v, seconds, hasAudio: p.streams.some(s => s.codec_type === 'audio') };
}
export async function fingerprint(path: string) {
  const s = await stat(path);
  if (!s.isFile()) throw new Error('일반 미디어 파일을 선택해 주세요.');
  return createHash('sha256').update(`${resolve(path).toLowerCase()}|${s.size}|${s.mtimeMs}`).digest('hex');
}
export class MediaEngine {
  readonly assets = new Map<string, { media: Media; proxy: string }>();
  constructor(readonly root: string, readonly cache: string, private captions?: CaptionEngine, private narrations?: NarrationStore) {}
  async import(path: string, signal?: AbortSignal, onProgress: (p: number) => void = () => {}, reuse?: Media): Promise<Media> {
    if (!/^[a-z]:[\\/]/i.test(path)) throw new Error('로컬 드라이브의 파일을 선택해 주세요. 네트워크 경로는 지원하지 않습니다.');
    const fp = await fingerprint(path);
    if (reuse && fp !== reuse.fingerprint) throw new Error('원본 파일이 이동되었거나 변경되었습니다. 재연결 검증이 필요합니다.');
    const data = await probe(this.root, path, signal);
    const { v, seconds, hasAudio } = inspect(data);
    await mkdir(this.cache, { recursive: true });
    // Keep the rotated source aspect without baked-in letterboxing; any project canvas can reuse it.
    const proxy = join(this.cache, `${fp}-native1920-30-bt709-v3.mp4`);
    let cached = false;
    try { await access(proxy); cached = true; } catch { /* Generate a new editing copy. */ }
    if (!cached) {
      const temp = join(this.cache, `${randomUUID()}.partial.mp4`);
      const sourceMatrix = v.color_space === 'bt709' ? 'bt709' : ['smpte170m', 'bt470bg'].includes(v.color_space ?? '') ? 'bt601' : v.color_space === 'smpte240m' ? 'smpte240m' : Math.max(v.width!, v.height!) <= 1024 ? 'bt601' : 'bt709';
      const vf = `setpts=PTS-STARTPTS,fps=30:start_time=0,scale=w='max(2,trunc(iw*sar/2)*2)':h=ih,setsar=1,scale=1920:1920:force_original_aspect_ratio=decrease:force_divisible_by=2:in_color_matrix=${sourceMatrix}:out_color_matrix=bt709:out_range=tv,setsar=1,format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=limited`;
      const args = ['-hide_banner', '-nostdin', '-v', 'warning', '-n', '-protocol_whitelist', 'file,pipe', '-i', path];
      if (!hasAudio) args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
      args.push('-map', '0:v:0', '-map', hasAudio ? '0:a:0' : '1:a:0', '-vf', vf,
        '-af', 'aresample=48000:async=1:first_pts=0,aformat=channel_layouts=stereo,apad',
        '-t', String(seconds), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-threads', '2',
        '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-map_metadata', '-1', '-metadata:s:v:0', 'rotate=0',
        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
        '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', temp);
      try {
        await run(binPath(this.root, 'ffmpeg'), args, { signal, onOutput: progressReader(Math.round(seconds * FPS), onProgress) });
        const check = await probe(this.root, temp, signal);
        if (!check.streams.find(s => s.codec_type === 'video')?.nb_frames) throw new Error('편집용 사본을 검증하지 못했습니다.');
        await rename(temp, proxy);
      } finally { await rm(temp, { force: true }); }
    }
    const normalized = await probe(this.root, proxy, signal);
    const video = normalized.streams.find(s => s.codec_type === 'video')!;
    const metadata: Media = reuse ?? { id: randomUUID(), name: basename(path), path: resolve(path), fingerprint: fp,
      durationFrames: Number(video.nb_frames), width: v.width!, height: v.height!, codec: v.codec_name,
      sourceFps: fraction(v.avg_frame_rate), timeBase: v.time_base ?? 'unknown', startTime: Number(v.start_time ?? data.format.start_time ?? 0),
      rotation: v.side_data_list?.find(s => s.rotation !== undefined)?.rotation ?? Number(v.tags?.rotate ?? 0), hasAudio,
      warnings: [...(!v.color_space || v.color_space === 'unknown' ? ['원본 색공간 미표기: SD는 BT.601, HD는 BT.709로 해석'] : []), ...(fraction(v.avg_frame_rate) !== fraction(v.r_frame_rate) ? ['가변 프레임률 가능성: 30fps로 정규화'] : [])] };
    const media: Media = { ...metadata, displayWidth: video.width!, displayHeight: video.height!,
      warnings: ['원본 비율 · 긴 변 1920px · 30fps SDR 편집용 사본 사용', ...metadata.warnings.filter(w => !w.includes('편집용 사본 사용'))] };
    if (media.durationFrames !== Number(video.nb_frames)) throw new Error('편집용 사본의 길이가 프로젝트와 다릅니다.');
    this.assets.set(media.id, { media, proxy }); onProgress(100); return media;
  }
  validate(project: Project) {
    ProjectSchema.parse(project);
    for (const m of project.media) {
      const a = this.assets.get(m.id);
      if (!a || a.media.path !== m.path || a.media.fingerprint !== m.fingerprint || a.media.durationFrames !== m.durationFrames)
        throw new Error(`미디어를 먼저 가져오거나 다시 열어 주세요: ${m.name}`);
    }
  }
  async still(mediaId: string, frame: number, color: Color = { ...NEUTRAL_COLOR }, signal?: AbortSignal,
    settings: CanvasSettings = canvasSettings('16:9'), framing: Framing = { ...DEFAULT_FRAMING }) {
    const asset = this.assets.get(mediaId);
    if (!asset || !Number.isInteger(frame) || frame < 0 || frame >= asset.media.durationFrames) throw new Error('프레임 범위가 잘못되었습니다.');
    const result = await run(binPath(this.root, 'ffmpeg'), ['-hide_banner', '-v', 'error', '-ss', String(frame / FPS), '-i', asset.proxy,
      '-frames:v', '1', '-vf', `${colorFilter(color)},${framingFilter(asset.media.displayWidth!, asset.media.displayHeight!, settings, framing)},scale=${settings.width / 2}:${settings.height / 2},format=rgb24,setparams=range=full:color_trc=iec61966-2-1`,
      '-color_range', 'pc', '-color_trc', 'iec61966-2-1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1'], { signal });
    return `data:image/png;base64,${result.stdout.toString('base64')}`;
  }
  async export(project: Project, destination: string, signal?: AbortSignal, onProgress: (p: number) => void = () => {}) {
    this.validate(project);
    if (project.narrations.length && !this.narrations) throw new Error('녹음 파일을 사용할 수 없습니다.');
    await this.narrations?.validate(project.narrations);
    const total = duration(project);
    if (!total) throw new Error('타임라인에 영상이 없습니다.');
    if (project.clips.length > 50) throw new Error('첫 검증 버전의 출력 한도는 클립 50개입니다.');
    if (!destination.toLowerCase().endsWith('.mp4')) throw new Error('MP4 파일 이름을 사용해 주세요.');
    const dest = resolve(destination).toLowerCase();
    if (dest.startsWith(resolve(this.cache).toLowerCase() + '\\') || project.media.some(m => resolve(m.path).toLowerCase() === dest)) throw new Error('원본이나 캐시 파일에 덮어쓸 수 없습니다.');
    try { await access(destination); throw new Error('이미 존재하는 파일입니다. 새 출력 이름을 선택해 주세요.'); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    // Detect replaced/moved source files before export, even if a cached copy still exists.
    for (const m of project.media) if (await fingerprint(m.path) !== m.fingerprint) throw new Error(`원본이 변경되었습니다: ${m.name}`);
    const temp = join(dirname(destination), `.vlogtool-${randomUUID()}.partial.mp4`);
    if (project.captions.some(c => c.text.trim()) && !this.captions) throw new Error('자막 렌더러를 사용할 수 없습니다.');
    const overlay = await this.captions?.overlay(project, signal, p => onProgress(p * .2));
    try {
      const args = ['-hide_banner', '-nostdin', '-v', 'warning', '-n', '-filter_complex_threads', '2'];
      const filters: string[] = [];
      project.clips.forEach((clip, i) => {
        args.push('-i', this.assets.get(clip.mediaId)!.proxy);
        const media = this.assets.get(clip.mediaId)!.media;
        filters.push(`[${i}:v]trim=start_frame=${clip.inFrame}:end_frame=${clip.outFrame},setpts=PTS-STARTPTS,${colorFilter(clip.color)},${framingFilter(media.displayWidth!, media.displayHeight!, project.settings, clip.framing)}[v${i}]`);
        filters.push(`[${i}:a]atrim=start_sample=${clip.inFrame * 1600}:end_sample=${clip.outFrame * 1600},asetpts=PTS-STARTPTS,volume=${clip.volume}[a${i}]`);
      });
      filters.push(`${project.clips.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${project.clips.length}:v=1:a=1[v][a]`);
      if (overlay) {
        args.push('-f', 'concat', '-safe', '0', '-protocol_whitelist', 'file,pipe', '-i', overlay.path);
        filters.push(`[${project.clips.length}:v]fps=30:start_time=0:round=near,trim=end_frame=${total},setpts=N/(30*TB),format=rgba[subs]`);
        filters.push('[v][subs]overlay=0:0:format=auto:eof_action=pass:shortest=0,format=yuv420p[outv]');
      }
      const takes = audibleNarrations(project.narrations, total);
      takes.forEach((n, i) => {
        args.push('-i', this.narrations!.assets.get(n.id)!.path);
        filters.push(narrationFilter(n, project.clips.length + (overlay ? 1 : 0) + i, total, `voice${i}`));
      });
      if (takes.length) filters.push(`[a]${takes.map((_, i) => `[voice${i}]`).join('')}amix=inputs=${takes.length + 1}:duration=first:dropout_transition=0:normalize=0,alimiter=limit=1:level=0:latency=1,atrim=end_sample=${total * 1600}[mixed]`);
      args.push('-filter_complex', filters.join(';'), '-map', overlay ? '[outv]' : '[v]', '-map', takes.length ? '[mixed]' : '[a]', '-frames:v', String(total), '-r', '30',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-threads', '2', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', temp);
      await run(binPath(this.root, 'ffmpeg'), args, { signal, onOutput: progressReader(total, p => onProgress(overlay ? 20 + p * .8 : p)) });
      const checked = await probe(this.root, temp, signal);
      const v = checked.streams.find(s => s.codec_type === 'video'), a = checked.streams.find(s => s.codec_type === 'audio');
      if (!v || Number(v.nb_frames) !== total || v.width !== project.settings.width || v.height !== project.settings.height || v.codec_name !== 'h264' || a?.codec_name !== 'aac') throw new Error('출력 검증에 실패했습니다. 완성 파일을 만들지 않았습니다.');
      if (signal?.aborted) throw new CancelledError();
      // COPYFILE_EXCL ensures even a last-second path collision cannot overwrite an original.
      await copyFile(temp, destination, constants.COPYFILE_EXCL);
      if (signal?.aborted) { await rm(destination, { force: true }); throw new CancelledError(); }
      onProgress(100); return destination;
    } finally { await rm(temp, { force: true }); await overlay?.cleanup(); }
  }
}
