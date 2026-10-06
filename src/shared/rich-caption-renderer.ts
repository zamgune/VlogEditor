import { CAPTION_FONTS, captionFontWeight, type CaptionBitmap, type CaptionRenderRequest } from './captions';
import { textStyleAt } from './rich-text';
import { gradientStops, gradientVector } from './decoration';

export function captionBackground(ctx: CanvasRenderingContext2D, s: CaptionRenderRequest['style'], scale: number, effect: number) {
  if (s.opacity <= 0) return;
  const w = ctx.canvas.width - effect * 2, h = ctx.canvas.height - effect * 2;
  ctx.globalAlpha = s.opacity;
  if (s.gradient) {
    const v = gradientVector(w, h, s.gradient.angle), gradient = ctx.createLinearGradient(effect + v.x0, effect + v.y0, effect + v.x1, effect + v.y1);
    for (const [at, color] of gradientStops(s.gradient)) gradient.addColorStop(at, color);
    ctx.fillStyle = gradient;
  } else ctx.fillStyle = s.background;
  ctx.beginPath(); ctx.roundRect(effect, effect, w, h, s.radius * scale); ctx.fill(); ctx.globalAlpha = 1;
}

export async function renderRichCaption({ text, runs = [], style: s, width: w, height: h }: CaptionRenderRequest): Promise<CaptionBitmap> {
  const scale = Math.min(w, h) / 1080, pad = s.padding * scale, effect = Math.ceil((s.outline + s.outer + s.shadow * 3) * scale + 3);
  const maxText = Math.max(s.size * scale, w * s.maxWidth - pad * 2 - effect * 2);
  const font = (style: typeof s) => `${captionFontWeight(style.font, style.weight)} ${style.size * scale}px ${CAPTION_FONTS[style.font].family}`;
  const glyphs = [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(text)].map(g => ({ text: g.segment, style: { ...s, ...textStyleAt(runs, g.index) } }));
  await Promise.all([...new Set([font(s), ...glyphs.map(g => font(g.style))])].map(f => document.fonts.load(f)));
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d')!;
  type Glyph = typeof glyphs[number];
  const chunks = (line: Glyph[]) => {
    const result: { text: string; style: typeof s; font: string; width: number }[] = [];
    for (const g of line) {
      const f = font(g.style), last = result.at(-1);
      if (last && last.font === f && last.style.color === g.style.color) last.text += g.text;
      else result.push({ ...g, font: f, width: 0 });
    }
    for (const r of result) { ctx.font = r.font; r.width = ctx.measureText(r.text).width; }
    return result;
  };
  const measure = (line: Glyph[]) => chunks(line).reduce((n, r) => n + r.width, 0);
  const lines: Glyph[][] = []; let line: Glyph[] = [];
  for (const g of glyphs) {
    if (/^[\r\n]+$/.test(g.text)) { lines.push(line); line = []; continue; }
    if (line.length && measure([...line, g]) > maxText) {
      let space = -1; for (let i = line.length - 1; i >= 0; i--) if (line[i].text === ' ') { space = i; break; }
      if (space > 0) { lines.push(line.slice(0, space)); line = line.slice(space + 1); }
      else { lines.push(line); line = []; }
      if (line.length && measure([...line, g]) > maxText) { lines.push(line); line = []; }
    }
    if (!line.length && g.text === ' ') continue;
    line.push(g);
  }
  lines.push(line);
  const layout = lines.map(line => ({ chunks: chunks(line), width: measure(line), size: (line.length ? Math.max(...line.map(g => g.style.size)) : s.size) * scale }));
  const bitmapWidth = Math.ceil(Math.max(1, ...layout.map(l => l.width)) + 2 * (pad + effect)), bitmapHeight = Math.ceil(layout.reduce((n, l) => n + l.size * s.lineHeight, 0) + 2 * (pad + effect));
  if (bitmapHeight > 8192 || bitmapWidth * bitmapHeight > 16777216) throw new Error('자막이 너무 깁니다. 문장을 나눠 주세요.');
  canvas.width = bitmapWidth; canvas.height = bitmapHeight; captionBackground(ctx, s, scale, effect);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.lineJoin = 'round'; let top = pad + effect;
  for (const line of layout) {
    let x = s.align === 'left' ? pad + effect : s.align === 'right' ? canvas.width - pad - effect - line.width : (canvas.width - line.width) / 2;
    const y = top + line.size * 1.08;
    for (const chunk of line.chunks) {
      ctx.font = chunk.font;
      if (s.shadow) { ctx.shadowColor = '#000000cc'; ctx.shadowBlur = s.shadow * scale; ctx.shadowOffsetY = s.shadow * scale / 2; }
      if (s.outer) { ctx.strokeStyle = s.outerColor; ctx.lineWidth = (s.outline + s.outer) * scale * 2; ctx.strokeText(chunk.text, x, y); }
      if (s.outline) { ctx.strokeStyle = s.outlineColor; ctx.lineWidth = s.outline * scale * 2; ctx.strokeText(chunk.text, x, y); }
      ctx.fillStyle = chunk.style.color; ctx.fillText(chunk.text, x, y); ctx.shadowColor = 'transparent'; x += chunk.width;
    }
    top += line.size * s.lineHeight;
  }
  return { url: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height, lines: lines.length };
}
