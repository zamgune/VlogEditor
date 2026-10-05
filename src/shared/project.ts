import { z } from 'zod';
import { ColorSchema, NEUTRAL_COLOR } from './color';
import { CanvasSettingsSchema, FramingSchema, DEFAULT_FRAMING, canvasSettings, type CanvasPresetId } from './canvas';
import { CaptionSchema, CaptionSettingsSchema, defaultCaptionSettings } from './captions';
import { NarrationSchema } from './narration';

export const FPS = 30;
const frame = z.number().int().min(0).max(30 * 60 * 60 * 24);
const id = z.string().uuid();
export const MediaSchema = z.object({
  id, name: z.string().min(1).max(512), path: z.string().min(1).max(32768),
  fingerprint: z.string().max(128), durationFrames: frame.min(1),
  width: z.number().int().positive().max(16384), height: z.number().int().positive().max(16384),
  displayWidth: z.number().int().min(2).max(1920).optional(), displayHeight: z.number().int().min(2).max(1920).optional(),
  codec: z.string().max(64), sourceFps: z.number().nonnegative().finite(),
  timeBase: z.string().max(64), startTime: z.number().finite(), rotation: z.number().finite(),
  hasAudio: z.boolean(), warnings: z.array(z.string().max(1024)).max(20)
}).strict();
export const ClipSchema = z.object({ id, mediaId: id, inFrame: frame, outFrame: frame, volume: z.number().min(0).max(1), color: ColorSchema.default(() => ({ ...NEUTRAL_COLOR })), framing: FramingSchema.default(() => ({ ...DEFAULT_FRAMING })) }).strict();
export const ProjectSchema = z.object({
  format: z.literal('vlogtool'), version: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7)]), id,
  name: z.string().min(1).max(200),
  settings: CanvasSettingsSchema,
  media: z.array(MediaSchema).max(200), clips: z.array(ClipSchema).max(200),
  captions: z.array(CaptionSchema).max(2000).default([]), captionSettings: CaptionSettingsSchema.default(defaultCaptionSettings),
  narrations: z.array(NarrationSchema).max(100).default([])
}).strict().superRefine((p, ctx) => {
  if (new Set(p.media.map(m => m.id)).size !== p.media.length || new Set(p.clips.map(c => c.id)).size !== p.clips.length)
    ctx.addIssue({ code: 'custom', message: '중복된 항목 ID입니다.' });
  for (const c of p.clips) {
    const m = p.media.find(m => m.id === c.mediaId);
    if (!m || c.outFrame <= c.inFrame || c.outFrame > m.durationFrames)
      ctx.addIssue({ code: 'custom', message: '클립 구간 또는 미디어 참조가 올바르지 않습니다.' });
  }
  const ids = new Set<string>();
  if (new Set(p.narrations.map(n => n.id)).size !== p.narrations.length) ctx.addIssue({ code: 'custom', message: '중복된 녹음 ID입니다.' });
  for (const c of p.captions) {
    if (c.kind === 'title') {
      if (ids.has(c.id) || c.clipId !== null || c.inFrame !== 0 || c.outFrame !== 0) ctx.addIssue({ code: 'custom', message: '전체 제목이 올바르지 않습니다.' });
      ids.add(c.id); continue;
    }
    const clip = p.clips.find(v => v.id === c.clipId), media = p.media.find(m => m.id === clip?.mediaId);
    if (ids.has(c.id) || !clip || !media || c.outFrame <= c.inFrame || c.outFrame > media.durationFrames)
      ctx.addIssue({ code: 'custom', message: '자막 구간 또는 연결된 영상이 올바르지 않습니다.' });
    ids.add(c.id);
  }
}).transform(p => {
  if (p.version >= 5) return { ...p, version: 7 as const };
  const rank = { normal: 0, title: 1, emphasis: 2 };
  const order = new Map([...p.captions].sort((a, b) => rank[a.kind] - rank[b.kind]).map((c, i) => [c.id, i]));
  return { ...p, version: 7 as const, captions: p.captions.map(c => ({ ...c, zOrder: order.get(c.id)! })) };
});
export type Media = z.infer<typeof MediaSchema>;
export type Clip = z.infer<typeof ClipSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export function newProject(preset: CanvasPresetId = '9:16'): Project {
  return { format: 'vlogtool', version: 7, id: crypto.randomUUID(), name: '나의 첫 브이로그',
    settings: canvasSettings(preset), media: [], clips: [], captions: [], captionSettings: defaultCaptionSettings(), narrations: [] };
}
export const duration = (p: Project) => p.clips.reduce((sum, c) => sum + c.outFrame - c.inFrame, 0);
export function locate(p: Project, timelineFrame: number) {
  let start = 0;
  for (const clip of p.clips) {
    const end = start + clip.outFrame - clip.inFrame;
    if (timelineFrame >= start && timelineFrame < end)
      return { clip, start, sourceFrame: clip.inFrame + timelineFrame - start };
    start = end;
  }
  return undefined;
}
export function split(p: Project, clipId: string, timelineFrame: number): Project {
  const at = locate(p, timelineFrame);
  if (!at || at.clip.id !== clipId || at.sourceFrame <= at.clip.inFrame) return p;
  const index = p.clips.findIndex(c => c.id === clipId);
  const clips = p.clips.slice();
  const rightId = crypto.randomUUID();
  clips.splice(index, 1, { ...at.clip, outFrame: at.sourceFrame }, { ...at.clip, id: rightId, inFrame: at.sourceFrame });
  const captions = p.captions.flatMap(c => {
    if (c.clipId !== clipId) return [c];
    return [c.inFrame < at.sourceFrame ? { ...c, outFrame: Math.min(c.outFrame, at.sourceFrame) } : null,
      c.outFrame > at.sourceFrame ? { ...c, id: crypto.randomUUID(), clipId: rightId, inFrame: Math.max(c.inFrame, at.sourceFrame) } : null].filter(c => c !== null);
  });
  return { ...p, clips, captions };
}
export function trim(p: Project, clipId: string, inFrame: number, outFrame: number): Project {
  const existing = p.clips.find(c => c.id === clipId);
  if (existing?.inFrame === inFrame && existing.outFrame === outFrame) return p;
  const next = { ...p, clips: p.clips.map(c => c.id === clipId ? { ...c, inFrame, outFrame } : c) };
  return ProjectSchema.parse(next);
}
export const removeClip = (p: Project, clipId: string): Project => ({ ...p, clips: p.clips.filter(c => c.id !== clipId), captions: p.captions.filter(c => c.clipId !== clipId) });
export function moveClip(p: Project, from: number, to: number): Project {
  if (from < 0 || to < 0 || from >= p.clips.length || to >= p.clips.length || from === to) return p;
  const clips = p.clips.slice(); const [c] = clips.splice(from, 1); clips.splice(to, 0, c); return { ...p, clips };
}
export function addMedia(p: Project, media: Media[]): Project {
  const seen = new Set(p.media.map(m => m.id));
  const unique = media.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
  return { ...p, media: [...p.media, ...unique], clips: [...p.clips, ...media.map(m => ({ id: crypto.randomUUID(), mediaId: m.id, inFrame: 0, outFrame: m.durationFrames, volume: 1, color: { ...NEUTRAL_COLOR }, framing: { ...DEFAULT_FRAMING } }))] };
}
export function timecode(f: number) {
  const n = Math.max(0, Math.round(f));
  return `${Math.floor(n / 1800).toString().padStart(2, '0')}:${Math.floor(n / 30) % 60 < 10 ? '0' : ''}${Math.floor(n / 30) % 60}:${(n % 30).toString().padStart(2, '0')}`;
}
export type History = { past: Project[]; present: Project; future: Project[] };
export function commit(h: History, p: Project): History {
  return p === h.present ? h : { past: [...h.past.slice(-99), h.present], present: p, future: [] };
}
export function finishPreview(before: History, present: Project, cancelled = false): History {
  // Schema parsing gives both snapshots the same property order, including imported media.
  if (cancelled || JSON.stringify(ProjectSchema.parse(before.present)) === JSON.stringify(ProjectSchema.parse(present))) return before;
  return commit(before, present);
}
export function undo(h: History): History {
  return h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h;
}
export function redo(h: History): History {
  return h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h;
}
