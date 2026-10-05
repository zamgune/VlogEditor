import { z } from 'zod';

export const MAX_RECORDING_FRAMES = 30 * 60 * 30;
const frame = z.number().int().nonnegative().max(30 * 60 * 60 * 24);
export const NarrationSchema = z.object({
  id: z.string().uuid(), name: z.string().min(1).max(200), path: z.string().min(1).max(32768),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/), durationFrames: frame.min(1).max(MAX_RECORDING_FRAMES),
  startFrame: frame, inFrame: frame, outFrame: frame, volume: z.number().min(0).max(1), muted: z.boolean()
}).strict().refine(n => n.inFrame < n.outFrame && n.outFrame <= n.durationFrames, '녹음 구간이 올바르지 않습니다.');
export type Narration = z.infer<typeof NarrationSchema>;
export type RecordingInput = { data: Uint8Array; frames: number; startFrame: number; name: string };
export type RecordingClock = { startFrame: number; startedAt: number };
export function narrationEnd(n: Narration, total: number) { return Math.min(total, n.startFrame + n.outFrame - n.inFrame); }
export function audibleNarrations(takes: Narration[], total: number) {
  return takes.filter(n => !n.muted && n.volume > 0 && n.startFrame < total);
}
export function narrationRows(takes: Narration[], total: number) {
  const rows: Narration[][] = [[]];
  for (const n of [...takes].filter(n => n.startFrame < total).sort((a, b) => a.startFrame - b.startFrame)) {
    let row = rows.find(r => !r.length || narrationEnd(r.at(-1)!, total) <= n.startFrame);
    if (!row) { row = []; rows.push(row); } row.push(n);
  }
  return rows;
}
export function narrationFilter(n: Narration, input: number, total: number, label: string) {
  const samples = (narrationEnd(n, total) - n.startFrame) * 1600;
  return `[${input}:a]atrim=start_sample=${n.inFrame * 1600}:end_sample=${n.inFrame * 1600 + samples},asetpts=PTS-STARTPTS,volume=${n.volume},aformat=sample_rates=48000:channel_layouts=stereo,adelay=${n.startFrame * 1600}S:all=1[${label}]`;
}
