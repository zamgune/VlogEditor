import { z } from 'zod';

export const CANVAS_PRESETS = [
  { id: '9:16', label: '9:16 · 세로 / 숏츠', width: 1080, height: 1920 },
  { id: '16:9', label: '16:9 · 가로 / 와이드', width: 1920, height: 1080 },
  { id: '1:1', label: '1:1 · 정사각형', width: 1080, height: 1080 },
  { id: '4:5', label: '4:5 · 세로', width: 1080, height: 1350 },
  { id: '4:3', label: '4:3 · 가로', width: 1440, height: 1080 },
  { id: '21:9', label: '21:9 · 울트라 와이드', width: 2520, height: 1080 }
] as const;
export type CanvasPresetId = typeof CANVAS_PRESETS[number]['id'];
export const FitSchema = z.enum(['contain', 'cover']);
export const CanvasSettingsSchema = z.object({
  width: z.number().int(), height: z.number().int(), fps: z.literal(30), color: z.literal('SDR'),
  fit: FitSchema.default('contain'), background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#000000')
}).strict().refine(s => CANVAS_PRESETS.some(p => p.width === s.width && p.height === s.height), '지원하지 않는 화면 규격입니다.');
export const FramingSchema = z.object({
  fit: z.enum(['inherit', 'contain', 'cover']).default('inherit'),
  x: z.number().int().min(0).max(100).default(50), y: z.number().int().min(0).max(100).default(50)
}).strict();
export type CanvasSettings = z.infer<typeof CanvasSettingsSchema>;
export type Framing = z.infer<typeof FramingSchema>;
export const DEFAULT_FRAMING: Framing = { fit: 'inherit', x: 50, y: 50 };
export function canvasSettings(id: CanvasPresetId): CanvasSettings {
  const preset = CANVAS_PRESETS.find(p => p.id === id)!;
  return { width: preset.width, height: preset.height, fps: 30, color: 'SDR', fit: 'contain', background: '#000000' };
}
export const canvasPreset = (s: Pick<CanvasSettings, 'width' | 'height'>) => CANVAS_PRESETS.find(p => p.width === s.width && p.height === s.height)!;
const evenFloor = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
const offset = (available: number, percent: number) => Math.min(available, Math.max(0, Math.round(available * percent / 200) * 2));

// Both Chromium and FFmpeg use this rectangle. Chroma-aligned crop/pad avoids 1-pixel drift.
export function framingGeometry(sourceWidth: number, sourceHeight: number, settings: CanvasSettings, framing: Framing) {
  if (![sourceWidth, sourceHeight].every(n => Number.isInteger(n) && n >= 2)) throw new Error('영상 크기가 올바르지 않습니다.');
  const fit = framing.fit === 'inherit' ? settings.fit : framing.fit;
  const { width, height } = settings;
  if (fit === 'cover') {
    const cropWidth = evenFloor(Math.min(sourceWidth, sourceHeight * width / height));
    const cropHeight = evenFloor(Math.min(sourceHeight, sourceWidth * height / width));
    return { cropX: offset(sourceWidth - cropWidth, framing.x), cropY: offset(sourceHeight - cropHeight, framing.y),
      cropWidth, cropHeight, width, height, left: 0, top: 0 };
  }
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const scaledWidth = evenFloor(sourceWidth * scale), scaledHeight = evenFloor(sourceHeight * scale);
  return { cropX: 0, cropY: 0, cropWidth: sourceWidth, cropHeight: sourceHeight,
    width: scaledWidth, height: scaledHeight, left: offset(width - scaledWidth, 50), top: offset(height - scaledHeight, 50) };
}
export function framingFilter(sourceWidth: number, sourceHeight: number, settings: CanvasSettings, framing: Framing) {
  const g = framingGeometry(sourceWidth, sourceHeight, settings, framing);
  return `crop=${g.cropWidth}:${g.cropHeight}:${g.cropX}:${g.cropY},scale=${g.width}:${g.height},setsar=1,pad=${settings.width}:${settings.height}:${g.left}:${g.top}:color=0x${settings.background.slice(1)}`;
}
export function framingStyle(sourceWidth: number, sourceHeight: number, settings: CanvasSettings, framing: Framing) {
  const g = framingGeometry(sourceWidth, sourceHeight, settings, framing);
  return { width: `${sourceWidth / g.cropWidth * g.width / settings.width * 100}%`,
    height: `${sourceHeight / g.cropHeight * g.height / settings.height * 100}%`,
    left: `${(g.left - g.cropX / g.cropWidth * g.width) / settings.width * 100}%`,
    top: `${(g.top - g.cropY / g.cropHeight * g.height) / settings.height * 100}%` };
}
