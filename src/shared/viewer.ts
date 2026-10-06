import { z } from 'zod';
import type { CanvasSettings } from './canvas';

export const DEVICE_PRESETS = [
  { id: 'iphone16pro', name: 'iPhone 16 Pro', width: 1206, height: 2622 },
  { id: 'galaxys25', name: 'Galaxy S25', width: 1080, height: 2340 },
  { id: 'flip6', name: 'Galaxy Z Flip6 · 펼침', width: 1080, height: 2640 },
  { id: 'fold6cover', name: 'Galaxy Z Fold6 · 바깥', width: 968, height: 2376 },
  { id: 'fold6open', name: 'Galaxy Z Fold6 · 펼침', width: 1856, height: 2160 },
] as const;
// Manufacturer dimensions; UI margins below are editable estimates, not platform guarantees.
export const DEVICE_SOURCES = [
  'https://support.apple.com/ko-kr/121031', 'https://www.samsung.com/sec/smartphones/galaxy-s25/specs/',
  'https://www.samsungmobilepress.com/articles/samsung-galaxy-z-fold6-and-z-flip6-elevate-galaxy-ai-to-new-heights',
];
const fraction = z.number().min(0).max(.45);
const MarginsSchema = z.object({ top: fraction, bottom: fraction, left: fraction, right: fraction });
export const CustomDeviceSchema = z.object({ id: z.string().min(1).max(80), name: z.string().trim().min(1).max(40), width: z.number().int().min(240).max(10000), height: z.number().int().min(240).max(10000) });
export const ViewSettingsSchema = z.object({
  version: z.literal(1), mode: z.enum(['original', 'device']), deviceId: z.string(), orientation: z.enum(['portrait', 'landscape']),
  platform: z.enum(['shorts', 'video']), fit: z.enum(['contain', 'cover']), guides: z.boolean(), controls: z.boolean(), banner: z.boolean(), bannerHeight: fraction,
  shorts: MarginsSchema, video: MarginsSchema, customDevices: z.array(CustomDeviceSchema).max(20),
});
export type ViewSettings = z.infer<typeof ViewSettingsSchema>;
export type Rect = { left: number; top: number; width: number; height: number };
export const DEFAULT_SHORTS = { top: .10, bottom: .25, left: .06, right: .18 };
export const DEFAULT_VIDEO = { top: .10, bottom: .18, left: 0, right: 0 };
export function defaultViewSettings(): ViewSettings {
  return { version: 1, mode: 'original', deviceId: 'galaxys25', orientation: 'portrait', platform: 'shorts', fit: 'contain', guides: true, controls: true, banner: false, bannerHeight: .15, shorts: { ...DEFAULT_SHORTS }, video: { ...DEFAULT_VIDEO }, customDevices: [] };
}
export function parseViewSettings(raw: unknown): ViewSettings {
  const parsed = ViewSettingsSchema.safeParse(raw);
  if (!parsed.success) return defaultViewSettings();
  const v = parsed.data;
  v.customDevices = v.customDevices.filter((p, i, all) => !DEVICE_PRESETS.some(d => d.id === p.id) && all.findIndex(d => d.id === p.id) === i);
  if (![...DEVICE_PRESETS, ...v.customDevices].some(d => d.id === v.deviceId)) v.deviceId = 'galaxys25';
  return v;
}
export type GuideArea = Rect & { id: string; label: string };
export type ViewerGeometry = { width: number; height: number; video: Rect; scale: number; areas: GuideArea[]; safe: Rect; enabled: boolean };
export function viewerGeometry(canvas: Pick<CanvasSettings, 'width' | 'height'>, view: ViewSettings): ViewerGeometry {
  const device = [...DEVICE_PRESETS, ...view.customDevices].find(p => p.id === view.deviceId) ?? DEVICE_PRESETS[1];
  const original = view.mode === 'original';
  const width = original ? canvas.width : view.orientation === 'portrait' ? device.width : device.height;
  const height = original ? canvas.height : view.orientation === 'portrait' ? device.height : device.width;
  const scale = (original || view.fit === 'contain' ? Math.min : Math.max)(width / canvas.width, height / canvas.height);
  const video = { left: (width - canvas.width * scale) / 2, top: (height - canvas.height * scale) / 2, width: canvas.width * scale, height: canvas.height * scale };
  const enabled = !original && view.guides;
  const m = view.platform === 'shorts' ? view.shorts : view.controls ? view.video : { top: 0, bottom: 0, left: 0, right: 0 };
  const bottom = Math.max(m.bottom, view.banner ? view.bannerHeight : 0);
  const areas: GuideArea[] = enabled ? [
    { id: 'top', label: '상단 버튼 영역', left: 0, top: 0, width, height: height * m.top },
    { id: 'bottom', label: view.platform === 'shorts' ? '하단 정보 영역' : '하단 재생 조작부', left: 0, top: height * (1 - m.bottom), width, height: height * m.bottom },
    { id: 'left', label: '왼쪽 가장자리', left: 0, top: 0, width: width * m.left, height },
    { id: 'right', label: view.platform === 'shorts' ? '좋아요·댓글·공유 영역' : '오른쪽 가장자리', left: width * (1 - m.right), top: 0, width: width * m.right, height },
    ...(view.banner ? [{ id: 'banner', label: '하단 배너 영역', left: 0, top: height * (1 - view.bannerHeight), width, height: height * view.bannerHeight }] : []),
  ].filter(a => a.width > 0 && a.height > 0) : [];
  return { width, height, video, scale, areas, enabled, safe: { left: width * m.left, top: height * m.top, width: width * (1 - m.left - m.right), height: height * (1 - m.top - bottom) } };
}
export function projectToViewer(rect: Rect, geometry: ViewerGeometry): Rect {
  return { left: geometry.video.left + rect.left * geometry.scale, top: geometry.video.top + rect.top * geometry.scale, width: rect.width * geometry.scale, height: rect.height * geometry.scale };
}
export function viewerToProject(x: number, y: number, geometry: ViewerGeometry) {
  return { x: (x - geometry.video.left) / geometry.scale, y: (y - geometry.video.top) / geometry.scale };
}
export function animatedRect(rect: Rect, motion: { x: number; y: number; scale: number }): Rect {
  return { left: rect.left + motion.x + rect.width * (1 - motion.scale) / 2, top: rect.top + motion.y + rect.height * (1 - motion.scale) / 2, width: rect.width * motion.scale, height: rect.height * motion.scale };
}
export function safeAreaWarnings(rect: Rect, geometry: ViewerGeometry): string[] {
  if (!geometry.enabled) return [];
  const box = projectToViewer(rect, geometry);
  const overlaps = (a: Rect, b: Rect) => a.left < b.left + b.width - .01 && a.left + a.width > b.left + .01 && a.top < b.top + b.height - .01 && a.top + a.height > b.top + .01;
  const warnings = geometry.areas.filter(a => overlaps(box, a)).map(a => `${a.label}과 겹침`);
  if (box.left < -.01 || box.top < -.01 || box.left + box.width > geometry.width + .01 || box.top + box.height > geometry.height + .01) warnings.push('기기 화면 밖으로 잘림');
  return warnings;
}
