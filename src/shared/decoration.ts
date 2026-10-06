import { z } from 'zod';
import type { Project } from './project';

export const GradientSchema = z.object({ angle: z.number().min(0).max(360), from: z.string().regex(/^#[0-9a-f]{6}$/i), to: z.string().regex(/^#[0-9a-f]{6}$/i), mode: z.enum(['soft', 'hard']).optional() }).strict();
export type Gradient = z.infer<typeof GradientSchema>;
// A missing mode is the original soft gradient. Repeated midpoint stops form a sharp split.
export function gradientStops(gradient: Gradient): [number, string][] {
  return gradient.mode === 'hard' ? [[0, gradient.from], [.5, gradient.from], [.5, gradient.to], [1, gradient.to]] : [[0, gradient.from], [1, gradient.to]];
}
export function gradientCss(gradient: Gradient) {
  return `linear-gradient(${gradient.angle}deg, ${gradientStops(gradient).map(([at, color]) => `${color} ${at * 100}%`).join(', ')})`;
}
// CSS convention: 0 degrees points up; 90 degrees points right.
export function gradientVector(width: number, height: number, angle: number) {
  const rad = angle * Math.PI / 180, dx = Math.sin(rad), dy = -Math.cos(rad), length = Math.abs(width * dx) + Math.abs(height * dy);
  return { x0: width / 2 - dx * length / 2, y0: height / 2 - dy * length / 2, x1: width / 2 + dx * length / 2, y1: height / 2 + dy * length / 2 };
}
export const DecorationSchema = z.object({
  id: z.string().uuid(), clipId: z.string().uuid().nullable(), name: z.string().min(1).max(80), kind: z.enum(['rectangle', 'ellipse']),
  inFrame: z.number().int().nonnegative(), outFrame: z.number().int().nonnegative(),
  x: z.number().min(-1).max(1), y: z.number().min(-1).max(1), width: z.number().min(.01).max(2), height: z.number().min(.01).max(2),
  color: z.string().regex(/^#[0-9a-f]{6}$/i), opacity: z.number().min(0).max(1), radius: z.number().min(0).max(1000),
  stroke: z.number().min(0).max(40), strokeColor: z.string().regex(/^#[0-9a-f]{6}$/i), layer: z.enum(['behind', 'front']), zOrder: z.number().int().nonnegative().max(1000000)
}).strict();
export type Decoration = z.infer<typeof DecorationSchema>;
export function decorationSpans(p: Project) {
  let start = 0;
  const spans = p.clips.flatMap(clip => {
    const base = start; start += clip.outFrame - clip.inFrame;
    return p.decorations.filter(s => s.clipId === clip.id).flatMap(shape => {
      const a = Math.max(clip.inFrame, shape.inFrame), b = Math.min(clip.outFrame, shape.outFrame);
      return b > a ? [{ shape, start: base + a - clip.inFrame, end: base + b - clip.inFrame }] : [];
    });
  });
  return [...spans, ...p.decorations.filter(s => s.clipId === null && start > 0).map(shape => ({ shape, start: 0, end: start }))];
}
export function activeDecorations(p: Project, frame: number) { return decorationSpans(p).filter(s => s.start <= frame && s.end > frame).map(s => s.shape).sort((a, b) => a.zOrder - b.zOrder); }
export function decorationRows(p: Project) {
  const rows: ReturnType<typeof decorationSpans>[] = [];
  for (const span of decorationSpans(p).sort((a, b) => a.start - b.start)) {
    const row = rows.find(r => r.at(-1)!.end <= span.start);
    if (row) row.push(span); else rows.push([span]);
  }
  return rows;
}
export function reorderDecoration(p: Project, id: string, direction: 'front' | 'back') {
  const ordered = [...p.decorations].sort((a, b) => a.zOrder - b.zOrder), shape = ordered.find(s => s.id === id);
  if (!shape) return p;
  const others = ordered.filter(s => s.id !== id), next = direction === 'front' ? [...others, shape] : [shape, ...others];
  const ranks = new Map(next.map((s, i) => [s.id, i]));
  return { ...p, decorations: p.decorations.map(s => ({ ...s, zOrder: ranks.get(s.id)! })) };
}
export function addDecoration(p: Project, clipId: string, kind: Decoration['kind'], frame: number) {
  const clip = p.clips.find(c => c.id === clipId)!;
  const shape: Decoration = { id: crypto.randomUUID(), clipId, kind, name: kind === 'rectangle' ? '사각형' : '타원', inFrame: Math.max(clip.inFrame, Math.min(clip.outFrame - 1, frame)), outFrame: clip.outFrame,
    x: .25, y: .35, width: .5, height: .3, color: '#bddfcb', opacity: 1, radius: kind === 'rectangle' ? 24 : 0, stroke: 0, strokeColor: '#ffffff', layer: 'behind', zOrder: Math.max(-1, ...p.decorations.map(s => s.zOrder)) + 1 };
  return { project: { ...p, decorations: [...p.decorations, shape] }, id: shape.id };
}
export function decorationGeometry(shape: Decoration, width: number, height: number) {
  const scale = Math.min(width, height) / 1080, w = shape.width * width, h = shape.height * height;
  return { x: shape.x * width, y: shape.y * height, width: w, height: h, radius: Math.min(w / 2, h / 2, shape.radius * scale), stroke: shape.stroke * scale };
}
export function drawDecoration(ctx: CanvasRenderingContext2D, shape: Decoration, width: number, height: number) {
  const g = decorationGeometry(shape, width, height), inset = g.stroke / 2;
  ctx.save(); ctx.globalAlpha = shape.opacity; ctx.fillStyle = shape.color; ctx.strokeStyle = shape.strokeColor; ctx.lineWidth = g.stroke;
  ctx.beginPath();
  if (shape.kind === 'ellipse') ctx.ellipse(g.x + g.width / 2, g.y + g.height / 2, Math.max(0, g.width / 2 - inset), Math.max(0, g.height / 2 - inset), 0, 0, Math.PI * 2);
  else ctx.roundRect(g.x + inset, g.y + inset, Math.max(0, g.width - g.stroke), Math.max(0, g.height - g.stroke), Math.max(0, g.radius - inset));
  ctx.fill(); if (g.stroke) ctx.stroke(); ctx.restore();
}
