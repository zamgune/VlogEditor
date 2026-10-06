import { z } from 'zod';
import type { Project } from './project';
import type { CanvasSettings } from './canvas';
import { FontSchema, TextRunsSchema, validTextRuns } from './rich-text';
import { DecorationSchema, decorationSpans, GradientSchema, type Decoration } from './decoration';
export { CAPTION_FONTS, captionFontWeight } from './rich-text';

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
export const CaptionKindSchema = z.enum(['normal', 'emphasis', 'title']);
export type CaptionKind = z.infer<typeof CaptionKindSchema>;
export const KIND_LABEL = { normal: '일반 자막', emphasis: '강조 캡션', title: '전체 제목' };
export const MotionEdgeSchema = z.object({ type: z.enum(['none', 'fade', 'pop', 'slide']), frames: z.number().int().min(3).max(30), direction: z.enum(['up', 'down', 'left', 'right']) }).strict();
export const CaptionMotionSchema = z.object({ enter: MotionEdgeSchema, exit: MotionEdgeSchema }).strict();
export type CaptionMotion = z.infer<typeof CaptionMotionSchema>;
export const noMotion = (): CaptionMotion => ({ enter: { type: 'none', frames: 9, direction: 'up' }, exit: { type: 'none', frames: 9, direction: 'up' } });
export const PositionSchema = z.object({ h: z.union([z.literal(0), z.literal(.5), z.literal(1)]), v: z.union([z.literal(0), z.literal(.5), z.literal(1)]), x: z.number().min(-2).max(3).nullable(), y: z.number().min(-2).max(3).nullable() }).strict();
const styleFields = {
  font: FontSchema, weight: z.number().int().min(100).max(900), size: z.number().min(16).max(200), color: hex,
  outline: z.number().min(0).max(16), outlineColor: hex, outer: z.number().min(0).max(16), outerColor: hex,
  background: hex, gradient: GradientSchema.nullable(), opacity: z.number().min(0).max(1), radius: z.number().min(0).max(60), padding: z.number().min(0).max(60), shadow: z.number().min(0).max(20),
  maxWidth: z.number().min(.2).max(1), position: PositionSchema,
  align: z.enum(['left', 'center', 'right']), lineHeight: z.number().min(1.2).max(2.4), motion: CaptionMotionSchema
};
export const CaptionStyleSchema = z.object(styleFields).extend({ gradient: styleFields.gradient.default(null), align: styleFields.align.default('center'), lineHeight: styleFields.lineHeight.default(1.4), motion: CaptionMotionSchema.default(noMotion) }).strict();
export type CaptionStyle = z.infer<typeof CaptionStyleSchema>;
export type CaptionPosition = z.infer<typeof PositionSchema>;
// A project-wide title has clipId=null and no fixed range (0,0); its span follows the whole timeline.
export const CaptionSchema = z.object({ id: z.string().uuid(), clipId: z.string().uuid().nullable(), kind: CaptionKindSchema,
  text: z.string().max(2000), runs: TextRunsSchema, inFrame: z.number().int().nonnegative(), outFrame: z.number().int().nonnegative(), zOrder: z.number().int().nonnegative().max(1000000).default(0), overrides: z.object(styleFields).partial().strict() }).strict().refine(c => validTextRuns(c.text, c.runs), '부분 글꼴 구간이 올바르지 않습니다.');
export type Caption = z.infer<typeof CaptionSchema>;
export const MarginsSchema = z.object({ horizontal: z.number().min(0).max(.3), top: z.number().min(0).max(.3), bottom: z.number().min(0).max(.4).nullable() }).strict();
export type Margins = z.infer<typeof MarginsSchema>;
const basic: CaptionStyle = { font: 'sans', weight: 600, size: 54, color: '#151515', outline: 0, outlineColor: '#111111', outer: 0, outerColor: '#ffffff', background: '#ffffff', gradient: null, opacity: .96, radius: 16, padding: 18, shadow: 0, maxWidth: .84, position: { h: .5, v: 1, x: null, y: null }, align: 'center', lineHeight: 1.4, motion: noMotion() };
export const PRESET_CATEGORIES = ['기본·대사', '감성·메모', '장소·정보', '강조·리액션', '제목·인트로'] as const;
export type CaptionPreset = { id: string; name: string; kind: CaptionKind; style: CaptionStyle; category: typeof PRESET_CATEGORIES[number] };
const originalPresets: Omit<CaptionPreset, 'category'>[] = [
  { id: 'vlog', name: '기본 브이로그', kind: 'normal', style: basic },
  { id: 'dark', name: '어두운 배경', kind: 'normal', style: { ...basic, color: '#ffffff', background: '#111111', opacity: .78 } },
  { id: 'cream', name: '따뜻한 메모', kind: 'normal', style: { ...basic, color: '#48382b', background: '#fff0d8', opacity: 1 } },
  { id: 'minimal', name: '담백한 자막', kind: 'normal', style: { ...basic, color: '#ffffff', opacity: 0, shadow: 4 } },
  ...([
    ['bold', '기본 강조', { color: '#ffffff', outline: 6 }],
    ['yellow', '노랑 강조', { color: '#ffe04d', outline: 6 }],
    ['variety', '예능형 강조', { color: '#ff8fa8', outline: 4, outlineColor: '#ffffff', outer: 5, outerColor: '#151515' }],
    ['serif', '감성 문구', { font: 'serif', weight: 600, color: '#ffffff', shadow: 5 }]
  ] as [string, string, Partial<CaptionStyle>][]).map(([id, name, style]) => ({ id, name, kind: 'emphasis' as const, style: { ...basic, size: 80, weight: 900, opacity: 0, position: { h: .5 as const, v: .5 as const, x: null, y: null }, ...style } }))
];
export const CAPTION_PRESETS: CaptionPreset[] = [
  ...originalPresets.map(p => ({ ...p, category: (p.id === 'cream' || p.id === 'serif' ? '감성·메모' : p.kind === 'emphasis' ? '강조·리액션' : '기본·대사') as CaptionPreset['category'] })),
  ...([
    ['outline', '얇은 외곽선', '기본·대사', { color: '#ffffff', opacity: 0, outline: 2 }],
    ['diary', '명조 일기', '감성·메모', { font: 'serif', color: '#634737', background: '#faf0e3', opacity: .9, radius: 3, weight: 500 }],
    ['pastel', '파스텔 메모', '감성·메모', { color: '#3e5148', background: '#dcebdc', opacity: .95, radius: 24 }],
    ['location', '장소 라벨', '장소·정보', { color: '#ffffff', background: '#263d38', opacity: .95, radius: 8, weight: 700 }],
    ['date', '날짜 기록', '장소·정보', { font: 'serif', color: '#ffffff', opacity: 0, shadow: 3, weight: 400 }],
    ['badge', '정보 배지', '장소·정보', { color: '#ffffff', background: '#456ba3', opacity: 1, radius: 60, weight: 700 }],
    ['info', '반투명 설명', '장소·정보', { color: '#ffffff', background: '#26303d', opacity: .55, radius: 4, align: 'left' }],
    ['stamp', '빨강 도장', '강조·리액션', { color: '#e94343', opacity: 0, outline: 3, outlineColor: '#fff5e9', outer: 2, outerColor: '#973333', weight: 900 }],
    ['plain-title', '담백한 제목', '제목·인트로', { color: '#ffffff', opacity: 0, shadow: 2, weight: 800 }],
    ['cinema', '시네마 명조', '제목·인트로', { font: 'serif', color: '#fff5df', opacity: 0, shadow: 4, weight: 500, lineHeight: 1.6 }],
    ['chapter', '챕터 카드', '제목·인트로', { color: '#233c35', background: '#f0e9dc', opacity: 1, radius: 0, padding: 36, weight: 800 }],
    ['glass-title', '반투명 제목', '제목·인트로', { color: '#ffffff', background: '#192321', opacity: .4, radius: 20, padding: 28, weight: 700 }]
  ] as [string, string, CaptionPreset['category'], Partial<CaptionStyle>][]).map(([id, name, category, style]) => ({ id, name, category, kind: 'normal' as const, style: { ...basic, ...style } }))
];
export const defaultCaptionSettings = () => ({ normal: structuredClone(CAPTION_PRESETS[0].style), emphasis: structuredClone(CAPTION_PRESETS[4].style), title: { ...structuredClone(CAPTION_PRESETS[4].style), size: 74, position: { h: .5 as const, v: 0 as const, x: null, y: null } }, margins: { horizontal: .08, top: .1, bottom: null } as Margins });
export const CaptionSettingsSchema = z.object({ normal: CaptionStyleSchema, emphasis: CaptionStyleSchema, title: CaptionStyleSchema, margins: MarginsSchema }).strict();
export const SavedCaptionStyleSchema = z.object({ id: z.string().uuid(), name: z.string().min(1).max(80), style: CaptionStyleSchema }).strict();
export type SavedCaptionStyle = z.infer<typeof SavedCaptionStyleSchema>;
export const CaptionGroupItemSchema = z.object({ kind: CaptionKindSchema, text: z.string().max(2000), runs: TextRunsSchema, style: CaptionStyleSchema,
  startFrame: z.number().int().min(0).max(2592000), endFrame: z.number().int().min(0).max(2592000)
}).strict().refine(item => validTextRuns(item.text, item.runs), '부분 글꼴 구간이 올바르지 않습니다.').refine(item => item.kind === 'title' ? item.startFrame === 0 && item.endFrame === 0 : item.endFrame > item.startFrame, '그룹의 표시 구간이 올바르지 않습니다.');
export const CaptionGroupDecorationSchema = DecorationSchema.omit({ id: true, clipId: true, inFrame: true, outFrame: true, zOrder: true }).extend({
  wholeTimeline: z.boolean(), startFrame: z.number().int().min(0).max(2592000), endFrame: z.number().int().min(0).max(2592000)
}).strict().refine(item => item.wholeTimeline ? item.startFrame === 0 && item.endFrame === 0 : item.endFrame > item.startFrame, '꾸미기의 표시 구간이 올바르지 않습니다.');
export const SavedCaptionGroupSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(80), items: z.array(CaptionGroupItemSchema).min(1).max(50), decorations: z.array(CaptionGroupDecorationSchema).max(50).default([]) }).strict();
export type SavedCaptionGroup = z.infer<typeof SavedCaptionGroupSchema>;
const LibrarySchema = z.object({ version: z.literal(4), styles: z.array(SavedCaptionStyleSchema).max(100), favorites: z.array(z.string().max(100)).max(120), groups: z.array(SavedCaptionGroupSchema).max(50), defaultGroupId: z.string().uuid().nullable().default(null) }).strict().superRefine((library, ctx) => {
  const valid = new Set([...CAPTION_PRESETS.map(p => `builtin:${p.id}`), ...library.styles.map(p => `user:${p.id}`)]);
  if (new Set(library.styles.map(p => p.id)).size !== library.styles.length || new Set(library.favorites).size !== library.favorites.length || library.favorites.some(id => !valid.has(id))) ctx.addIssue({ code: 'custom', message: '스타일 보관함 항목이 올바르지 않습니다.' });
  if (new Set(library.groups.map(g => g.id)).size !== library.groups.length) ctx.addIssue({ code: 'custom', message: '중복된 그룹입니다.' });
  if (library.defaultGroupId && !library.groups.some(g => g.id === library.defaultGroupId)) ctx.addIssue({ code: 'custom', message: '기본 자막 스타일을 찾을 수 없습니다.' });
});
export const CaptionLibrarySchema = z.preprocess(value => {
  if (Array.isArray(value)) return { version: 4, styles: value, favorites: [], groups: [] };
  if (value && typeof value === 'object' && 'version' in value && value.version === 1) return { ...value, version: 4, groups: [] };
  if (value && typeof value === 'object' && 'version' in value && (value.version === 2 || value.version === 3)) return { ...value, version: 4 };
  return value;
}, LibrarySchema);
export type CaptionLibrary = z.infer<typeof CaptionLibrarySchema>;
export const emptyCaptionLibrary = (): CaptionLibrary => ({ version: 4, styles: [], favorites: [], groups: [], defaultGroupId: null });

export function captureCaptionGroup(p: Project, ids: string[], name: string, shapeIds: string[] = []): SavedCaptionGroup {
  const selected = new Set(ids), visible = new Set(captionSpans(p).map(s => s.caption.id));
  const captions = p.captions.filter(c => selected.has(c.id)).sort((a, b) => a.zOrder - b.zOrder);
  if (!captions.length || captions.length > 50 || captions.some(c => !visible.has(c.id))) throw new Error('화면에 표시되는 글을 1~50개 선택해 주세요.');
  const chosenShapes = new Set(shapeIds), visibleShapes = new Set(decorationSpans(p).map(s => s.shape.id));
  const shapes = p.decorations.filter(s => chosenShapes.has(s.id)).sort((a, b) => a.zOrder - b.zOrder);
  if (shapes.length > 50 || shapes.some(s => !visibleShapes.has(s.id))) throw new Error('화면에 표시되는 도형을 최대 50개 선택해 주세요.');
  return SavedCaptionGroupSchema.parse({ id: crypto.randomUUID(), name, items: captions.map(c => {
    const style = structuredClone(effectiveStyle(p, c));
    const anchor = captionRect({ width: 0, height: 0 }, style, p.settings, p.captionSettings.margins);
    style.position = { ...style.position, x: anchor.left / p.settings.width, y: anchor.top / p.settings.height };
    const clip = p.clips.find(v => v.id === c.clipId);
    return { kind: c.kind, text: c.text, runs: structuredClone(c.runs), style,
      startFrame: clip ? Math.max(c.inFrame, clip.inFrame) - clip.inFrame : 0,
      endFrame: clip ? Math.min(c.outFrame, clip.outFrame) - clip.inFrame : 0 };
  }), decorations: shapes.map(s => {
    const { id: _, clipId, inFrame, outFrame, zOrder: __, ...appearance } = structuredClone(s);
    const clip = p.clips.find(c => c.id === clipId);
    return { ...appearance, wholeTimeline: !clip, startFrame: clip ? Math.max(inFrame, clip.inFrame) - clip.inFrame : 0, endFrame: clip ? Math.min(outFrame, clip.outFrame) - clip.inFrame : 0 };
  }) });
}
// As a default subtitle, every component follows the new subtitle's visible interval.
// Explicit group loading instead restores the saved kinds and clip-relative intervals.
export function applyCaptionGroup(p: Project, input: SavedCaptionGroup, clipId?: string, subtitleFrame?: number): { project: Project; ids: string[]; shapeIds: string[] } {
  const group = SavedCaptionGroupSchema.parse(input), clip = p.clips.find(c => c.id === clipId);
  const asSubtitle = subtitleFrame !== undefined;
  if (asSubtitle && !Number.isFinite(subtitleFrame)) throw new Error('자막 시작 위치가 올바르지 않습니다.');
  if (!p.clips.length || ((asSubtitle || group.items.some(i => i.kind !== 'title') || group.decorations.some(s => !s.wholeTimeline)) && !clip)) throw new Error('그룹을 넣을 영상을 먼저 선택해 주세요.');
  if (p.captions.length + group.items.length > 2000) throw new Error('프로젝트에는 글을 최대 2000개까지 넣을 수 있습니다.');
  if (p.decorations.length + group.decorations.length > 500) throw new Error('프로젝트에는 도형을 최대 500개까지 넣을 수 있습니다.');
  const interval = (startFrame: number, endFrame: number, wholeTimeline: boolean) => {
    if (wholeTimeline && !asSubtitle) return { clipId: null, inFrame: 0, outFrame: 0 };
    const length = clip!.outFrame - clip!.inFrame;
    const start = Math.max(0, Math.min(asSubtitle ? Math.round(subtitleFrame!) - clip!.inFrame : startFrame, length - 1));
    const end = asSubtitle ? length : Math.max(start + 1, Math.min(endFrame, length));
    return { clipId: clip!.id, inFrame: clip!.inFrame + start, outFrame: clip!.inFrame + end };
  };
  const order = nextOrder(p);
  const added: Caption[] = group.items.map((item, i) => {
    return { id: crypto.randomUUID(), kind: asSubtitle ? 'normal' : item.kind, text: item.text, runs: structuredClone(item.runs), ...interval(item.startFrame, item.endFrame, item.kind === 'title'),
      zOrder: order + i, overrides: structuredClone(item.style) };
  });
  const shapeOrder = Math.max(-1, ...p.decorations.map(s => s.zOrder)) + 1;
  const shapes: Decoration[] = group.decorations.map((item, i) => {
    const { wholeTimeline, startFrame, endFrame, ...appearance } = structuredClone(item);
    return { ...appearance, id: crypto.randomUUID(), ...interval(startFrame, endFrame, wholeTimeline), zOrder: shapeOrder + i };
  });
  return { project: { ...p, captions: [...p.captions, ...added], decorations: [...p.decorations, ...shapes] }, ids: added.map(c => c.id), shapeIds: shapes.map(s => s.id) };
}
export function presetPatch(style: CaptionStyle, includeLayout = false): Partial<CaptionStyle> {
  const copy = structuredClone(style);
  if (includeLayout) return copy;
  const { size: _, position: __, maxWidth: ___, ...appearance } = copy; return appearance;
}
export const CaptionRenderRequestSchema = z.object({ text: z.string().max(2000), runs: TextRunsSchema, style: CaptionStyleSchema, width: z.number().int().min(2).max(4096), height: z.number().int().min(2).max(4096) }).strict().refine(r => validTextRuns(r.text, r.runs), '부분 글꼴 구간이 올바르지 않습니다.');
export type CaptionRenderRequest = Omit<z.output<typeof CaptionRenderRequestSchema>, 'runs'> & { runs?: z.output<typeof TextRunsSchema> };
export type CaptionBitmap = { url: string; width: number; height: number; lines: number };
export const effectiveStyle = (p: Project, c: Caption): CaptionStyle => ({ ...p.captionSettings[c.kind], ...c.overrides });
export function captionRect(bitmap: Pick<CaptionBitmap, 'width' | 'height'>, style: CaptionStyle, settings: Pick<CanvasSettings, 'width' | 'height'>, margins: Margins) {
  const { h, v, x, y } = style.position;
  const bottom = margins.bottom ?? (settings.width * 16 === settings.height * 9 ? .18 : .1);
  const px = x ?? (h === 0 ? margins.horizontal : h === 1 ? 1 - margins.horizontal : .5);
  const py = y ?? (v === 0 ? margins.top : v === 1 ? 1 - bottom : .5);
  const left = Math.round(px * settings.width - bitmap.width * h), top = Math.round(py * settings.height - bitmap.height * v);
  return { left, top, width: bitmap.width, height: bitmap.height, overflow: left < 0 || top < 0 || left + bitmap.width > settings.width || top + bitmap.height > settings.height };
}
export function fitNewCaption(p: Project, id: string, bitmap: Pick<CaptionBitmap, 'width' | 'height'>): Project {
  const caption = p.captions.find(c => c.id === id); if (!caption) return p;
  const style = effectiveStyle(p, caption), rect = captionRect(bitmap, style, p.settings, p.captionSettings.margins);
  if (!rect.overflow || bitmap.width > p.settings.width || bitmap.height > p.settings.height) return p;
  const left = Math.max(0, Math.min(p.settings.width - bitmap.width, rect.left)), top = Math.max(0, Math.min(p.settings.height - bitmap.height, rect.top));
  const position = { ...style.position, x: (left + bitmap.width * style.position.h) / p.settings.width, y: (top + bitmap.height * style.position.v) / p.settings.height };
  return { ...p, captions: p.captions.map(c => c.id === id ? { ...c, overrides: { ...c.overrides, position } } : c) };
}
export function captionSpans(p: Project) {
  let start = 0;
  const clips = p.clips.flatMap(clip => {
    const base = start; start += clip.outFrame - clip.inFrame;
    return p.captions.filter(c => c.clipId === clip.id).flatMap(c => {
      const a = Math.max(c.inFrame, clip.inFrame), b = Math.min(c.outFrame, clip.outFrame);
      return b > a ? [{ caption: c, start: base + a - clip.inFrame, end: base + b - clip.inFrame }] : [];
    });
  });
  return [...clips, ...p.captions.filter(c => c.kind === 'title' && start > 0).map(c => ({ caption: c, start: 0, end: start }))];
}
export function addCaption(p: Project, clipId: string, kind: CaptionKind, sourceFrame: number): { project: Project; id: string } {
  if (kind === 'title') {
    const c: Caption = { id: crypto.randomUUID(), clipId: null, kind, text: '나의 하루 기록', runs: [], inFrame: 0, outFrame: 0, zOrder: nextOrder(p), overrides: {} };
    c.overrides = offsetNewCaption(p, c);
    return { project: { ...p, captions: [...p.captions, c] }, id: c.id };
  }
  const clip = p.clips.find(c => c.id === clipId)!;
  const at = Math.max(clip.inFrame, Math.min(clip.outFrame - 1, Math.round(sourceFrame)));
  const caption: Caption = { id: crypto.randomUUID(), clipId, kind, text: kind === 'normal' ? '오늘의 작은 순간' : '이 순간!', runs: [], inFrame: at, outFrame: kind === 'normal' ? clip.outFrame : Math.min(clip.outFrame, at + 60), zOrder: nextOrder(p), overrides: {} };
  caption.overrides = offsetNewCaption(p, caption);
  return { project: { ...p, captions: [...p.captions, caption] }, id: caption.id };
}
export function splitCaption(p: Project, id: string, sourceFrame: number): Project {
  const caption = p.captions.find(c => c.id === id);
  if (!caption || caption.kind === 'title' || sourceFrame <= caption.inFrame || sourceFrame >= caption.outFrame) return p;
  return { ...p, captions: p.captions.flatMap(c => c.id !== id ? [c] : [{ ...c, outFrame: sourceFrame }, { ...c, id: crypto.randomUUID(), inFrame: sourceFrame }]) };
}
export function captionRange(p: Project, id: string, a: number, b: number): Project {
  const c = p.captions.find(c => c.id === id); if (!c || c.kind === 'title' || !Number.isFinite(a) || !Number.isFinite(b)) return p;
  const clip = p.clips.find(v => v.id === c.clipId); if (!clip) return p;
  const min = clip.inFrame, max = clip.outFrame;
  a = Math.max(min, Math.min(max - 1, Math.round(a))); b = Math.max(a + 1, Math.min(max, Math.round(b)));
  return a === c.inFrame && b === c.outFrame ? p : { ...p, captions: p.captions.map(v => v.id === id ? { ...v, inFrame: a, outFrame: b } : v) };
}

const nextOrder = (p: Project) => Math.max(-1, ...p.captions.map(c => c.zOrder)) + 1;
function offsetNewCaption(p: Project, caption: Caption): Partial<CaptionStyle> {
  const style = effectiveStyle(p, caption), rect = captionRect({ width: 0, height: 0 }, style, p.settings, p.captionSettings.margins);
  const siblings = p.captions.filter(c => c.clipId === caption.clipId && (caption.kind === 'title' || (c.inFrame < caption.outFrame && c.outFrame > caption.inFrame)));
  let x = rect.left / p.settings.width, y = rect.top / p.settings.height;
  const step = Math.max(.045, (style.size * style.lineHeight + style.padding * 2 + 12) * Math.min(p.settings.width, p.settings.height) / 1080 / p.settings.height);
  for (let i = 0; i < siblings.length + 1; i++) {
    const occupied = siblings.some(c => { const r = captionRect({ width: 0, height: 0 }, effectiveStyle(p, c), p.settings, p.captionSettings.margins); return Math.abs(r.left / p.settings.width - x) < .03 && Math.abs(r.top / p.settings.height - y) < .025; });
    if (!occupied) break;
    const candidate = y + (style.position.v === 1 ? -step : step);
    if (candidate >= .1 && candidate <= .9) y = candidate;
    else { x = Math.max(.15, Math.min(.85, x + (x > .5 ? -.06 : .06))); y = Math.max(.1, Math.min(.9, y)); }
  }
  return x === rect.left / p.settings.width && y === rect.top / p.settings.height ? caption.overrides : { ...caption.overrides, position: { ...style.position, x, y } };
}
export type CaptionClipboard = { projectId: string; caption: Caption; durationFrames: number };
export function copyCaption(p: Project, id: string): CaptionClipboard {
  const source = p.captions.find(c => c.id === id);
  if (!source) throw new Error('복사할 자막을 선택해 주세요.');
  // Freeze inherited styles and resolved anchors, so pasting into another project keeps the design.
  const item = captureCaptionGroup(p, [id], '복사한 자막').items[0];
  return { projectId: p.id, caption: { ...structuredClone(source), overrides: item.style }, durationFrames: item.endFrame - item.startFrame };
}
function nextCaptionGap(p: Project, clipId: string, from: number, length: number) {
  const clip = p.clips.find(c => c.id === clipId)!;
  let at = Math.max(from, clip.inFrame);
  const occupied = p.captions.filter(c => c.clipId === clipId).map(c => ({ start: Math.max(clip.inFrame, c.inFrame), end: Math.min(clip.outFrame, c.outFrame) })).filter(c => c.end > c.start).sort((a, b) => a.start - b.start);
  for (const span of occupied) {
    if (span.end <= at) continue;
    if (at + length <= span.start) return at;
    at = Math.max(at, span.end);
  }
  return at + length <= clip.outFrame ? at : null;
}
export function pasteCaption(p: Project, copied: CaptionClipboard, options: { autoAfter?: boolean; clipId?: string; sourceFrame?: number } = {}): { project: Project; id: string; movedAfter: boolean } {
  if (p.captions.length >= 2000) throw new Error('프로젝트에는 글을 최대 2000개까지 넣을 수 있습니다.');
  if (!p.clips.length) throw new Error('자막을 붙여넣을 영상을 먼저 선택해 주세요.');
  const source = copied.caption, copy: Caption = { ...structuredClone(source), id: crypto.randomUUID(), zOrder: nextOrder(p) };
  let movedAfter = false;
  if (source.kind !== 'title') {
    const clip = p.clips.find(c => c.id === options.clipId) ?? (copied.projectId === p.id ? p.clips.find(c => c.id === source.clipId) : undefined);
    if (!clip) throw new Error('자막을 붙여넣을 영상을 먼저 선택해 주세요.');
    const sameClip = copied.projectId === p.id && source.clipId === clip.id;
    const visibleStart = Math.max(source.inFrame, clip.inFrame), visibleEnd = Math.min(source.outFrame, clip.outFrame);
    const hasOriginalRange = sameClip && visibleEnd > visibleStart;
    copy.clipId = clip.id;
    if (!hasOriginalRange) {
      const frame = Number.isFinite(options.sourceFrame) ? Math.round(options.sourceFrame!) : clip.inFrame;
      copy.inFrame = Math.max(clip.inFrame, Math.min(clip.outFrame - 1, frame));
      copy.outFrame = Math.min(clip.outFrame, copy.inFrame + copied.durationFrames);
    }
    if (options.autoAfter && hasOriginalRange) {
      const length = visibleEnd - visibleStart, next = nextCaptionGap(p, clip.id, visibleEnd, length);
      if (next !== null) { copy.inFrame = next; copy.outFrame = next + length; movedAfter = true; }
    }
  }
  // Sequential copies keep their screen position. Overlapping copies remain easy to select.
  if (!movedAfter) copy.overrides = offsetNewCaption(p, copy);
  return { project: { ...p, captions: [...p.captions, copy] }, id: copy.id, movedAfter };
}
export function duplicateCaption(p: Project, id: string, autoAfter = false): { project: Project; id: string; movedAfter: boolean } {
  const source = p.captions.find(c => c.id === id);
  if (!source || p.captions.length >= 2000) return { project: p, id, movedAfter: false };
  return pasteCaption(p, copyCaption(p, id), { autoAfter, clipId: source.clipId ?? undefined });
}
export function reorderCaption(p: Project, id: string, direction: -1 | 1, frame?: number): Project {
  const spans = captionSpans(p), target = spans.find(s => s.caption.id === id); if (!target) return p;
  const at = frame ?? target.start, visible = new Set(spans.filter(s => s.start <= at && s.end > at).map(s => s.caption.id));
  const ordered = [...p.captions].sort((a, b) => a.zOrder - b.zOrder), index = ordered.findIndex(c => c.id === id);
  let to = index + direction;
  while (to >= 0 && to < ordered.length && !visible.has(ordered[to].id)) to += direction;
  if (index < 0 || to < 0 || to >= ordered.length) return p;
  [ordered[index], ordered[to]] = [ordered[to], ordered[index]];
  const orders = new Map(ordered.map((c, i) => [c.id, i]));
  return { ...p, captions: p.captions.map(c => ({ ...c, zOrder: orders.get(c.id)! })) };
}
export type CaptionSpan = ReturnType<typeof captionSpans>[number];
export function activeCaptionSpans(p: Project, frame: number) {
  return captionSpans(p).filter(s => s.start <= frame && s.end > frame).sort((a, b) => a.caption.zOrder - b.caption.zOrder);
}
export function captionRows(spans: CaptionSpan[]): CaptionSpan[][] {
  const rows: CaptionSpan[][] = [];
  for (const span of [...spans].sort((a, b) => a.start - b.start || a.caption.id.localeCompare(b.caption.id))) {
    const row = rows.find(r => r[r.length - 1].end <= span.start);
    if (row) row.push(span); else rows.push([span]);
  }
  return rows.length ? rows : [[]];
}
export function motionDurations(motion: CaptionMotion, length: number) {
  const requestedIn = motion.enter.type === 'none' ? 0 : motion.enter.frames, requestedOut = motion.exit.type === 'none' ? 0 : motion.exit.frames;
  const budget = Math.max(0, length - 1), total = requestedIn + requestedOut;
  const enter = total > budget ? Math.floor(requestedIn * budget / total) : requestedIn;
  const exit = total > budget ? budget - enter : requestedOut;
  return { enter, exit };
}
export type CaptionTransform = { alpha: number; scale: number; x: number; y: number };
export function captionTransform(motion: CaptionMotion, start: number, end: number, frame: number, shortSide: number): CaptionTransform {
  const result = { alpha: 1, scale: 1, x: 0, y: 0 };
  const { enter, exit } = motionDurations(motion, end - start);
  const local = frame - start, remaining = end - 1 - frame;
  const entrance = enter > 0 && local < enter, leaving = exit > 0 && remaining < exit;
  if (!entrance && !leaving) return result;
  const edge = entrance ? motion.enter : motion.exit;
  const progress = Math.max(0, Math.min(1, entrance ? local / enter : remaining / exit));
  const eased = 1 - Math.pow(1 - progress, 3);
  result.alpha = edge.type === 'fade' ? progress : eased;
  if (edge.type === 'pop') result.scale = .72 + .28 * eased;
  if (edge.type === 'slide') {
    const distance = 48 * shortSide / 1080 * (1 - eased) * (entrance ? -1 : 1);
    if (edge.direction === 'left') result.x = -distance;
    if (edge.direction === 'right') result.x = distance;
    if (edge.direction === 'up') result.y = -distance;
    if (edge.direction === 'down') result.y = distance;
  }
  return result;
}
export function captionSceneBoundaries(p: Project): number[] {
  const total = p.clips.reduce((sum, c) => sum + c.outFrame - c.inFrame, 0), bounds = new Set([0, total]);
  for (const span of captionSpans(p)) {
    if (!span.caption.text.trim()) continue;
    bounds.add(span.start); bounds.add(span.end);
    const d = motionDurations(effectiveStyle(p, span.caption).motion, span.end - span.start);
    for (let f = span.start; f <= span.start + d.enter; f++) bounds.add(f);
    for (let f = span.end - d.exit; f <= span.end; f++) bounds.add(f);
  }
  return [...bounds].sort((a, b) => a - b);
}
