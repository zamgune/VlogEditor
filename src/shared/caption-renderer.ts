import { captionBackground, renderRichCaption } from './rich-caption-renderer';
import { drawDecoration, type Decoration } from './decoration';
import { CAPTION_FONTS, captionFontWeight, captionRect, type CaptionBitmap, type CaptionRenderRequest, type Margins, type CaptionTransform } from './captions';

const bitmaps = new Map<string, CaptionBitmap>();
export async function renderCaption(request: CaptionRenderRequest): Promise<CaptionBitmap> {
  const { text, style: s, width: w, height: h } = request;
  const key = JSON.stringify({ text, runs: request.runs ?? [], width: w, height: h, style: { ...s, position: undefined, motion: undefined } });
  const cached = bitmaps.get(key); if (cached) return cached;
  if (request.runs?.length) { const result = await renderRichCaption(request); bitmaps.set(key, result); if (bitmaps.size > 64) bitmaps.delete(bitmaps.keys().next().value!); return result; }
  const scale = Math.min(w, h) / 1080, size = s.size * scale;
  const font = `${captionFontWeight(s.font, s.weight)} ${size}px ${CAPTION_FONTS[s.font].family}`;
  await document.fonts.load(font);
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d')!;
  ctx.font = font;
  const pad = s.padding * scale, effect = Math.ceil((s.outline + s.outer + s.shadow * 3) * scale + 3);
  const maxText = Math.max(size, w * s.maxWidth - pad * 2 - effect * 2);
  const lines: string[] = [];
  const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    let line = '';
    for (const { segment } of segmenter.segment(paragraph)) {
      if (line && ctx.measureText(line + segment).width > maxText) {
        const space = line.lastIndexOf(' ');
        if (space > 0) { lines.push(line.slice(0, space)); line = line.slice(space + 1); }
        else { lines.push(line); line = ''; }
      }
      if (!line && segment === ' ') continue;
      line += segment;
    }
    lines.push(line);
  }
  const lineHeight = size * s.lineHeight;
  const textWidth = Math.max(1, ...lines.map(l => ctx.measureText(l).width));
  const bitmapWidth = Math.ceil(textWidth + pad * 2 + effect * 2), bitmapHeight = Math.ceil(lines.length * lineHeight + pad * 2 + effect * 2);
  if (bitmapHeight > 8192 || bitmapWidth * bitmapHeight > 16777216) throw new Error('자막이 너무 깁니다. 문장을 나눠 주세요.');
  canvas.width = bitmapWidth; canvas.height = bitmapHeight;
  ctx.font = font; ctx.textAlign = s.align; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  captionBackground(ctx, s, scale, effect);
  lines.forEach((line, index) => {
    const x = s.align === 'left' ? effect + pad : s.align === 'right' ? canvas.width - effect - pad : canvas.width / 2, y = effect + pad + index * lineHeight + size * 1.08;
    if (s.shadow) { ctx.shadowColor = '#000000cc'; ctx.shadowBlur = s.shadow * scale; ctx.shadowOffsetY = s.shadow * scale / 2; }
    if (s.outer) { ctx.strokeStyle = s.outerColor; ctx.lineWidth = (s.outline + s.outer) * scale * 2; ctx.strokeText(line, x, y); }
    if (s.outline) { ctx.strokeStyle = s.outlineColor; ctx.lineWidth = s.outline * scale * 2; ctx.strokeText(line, x, y); }
    ctx.fillStyle = s.color; ctx.fillText(line, x, y); ctx.shadowColor = 'transparent';
  });
  const result = { url: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height, lines: lines.length };
  bitmaps.set(key, result); if (bitmaps.size > 64) bitmaps.delete(bitmaps.keys().next().value!);
  return result;
}
export async function renderCaptionScene(input: { width: number; height: number; margins: Margins; captions: (CaptionRenderRequest & { transform?: CaptionTransform })[]; decorations?: Decoration[] }) {
  const canvas = document.createElement('canvas'); canvas.width = input.width; canvas.height = input.height;
  const ctx = canvas.getContext('2d')!;
  const shapes = [...(input.decorations ?? [])].sort((a, b) => a.zOrder - b.zOrder);
  for (const shape of shapes.filter(s => s.layer === 'behind')) drawDecoration(ctx, shape, input.width, input.height);
  for (const request of input.captions) {
    if (!request.text.trim()) continue;
    let bitmap: CaptionBitmap;
    try { bitmap = await renderCaption(request); }
    catch (error) { throw new Error(`자막 렌더링 실패: ${request.text.slice(0, 30)} — ${error instanceof Error ? error.message : String(error)}`); }
    const rect = captionRect(bitmap, request.style, input, input.margins);
    if (rect.overflow) throw new Error(`화면을 벗어난 자막: ${request.text.slice(0, 30)} — 크기나 위치를 조절해 주세요.`);
    const image = new Image(); image.src = bitmap.url; await image.decode();
    const t = request.transform ?? { alpha: 1, scale: 1, x: 0, y: 0 };
    ctx.save(); ctx.globalAlpha = t.alpha;
    ctx.translate(rect.left + rect.width / 2 + t.x, rect.top + rect.height / 2 + t.y); ctx.scale(t.scale, t.scale);
    ctx.drawImage(image, -rect.width / 2, -rect.height / 2); ctx.restore();
  }
  for (const shape of shapes.filter(s => s.layer === 'front')) drawDecoration(ctx, shape, input.width, input.height);
  return canvas.toDataURL('image/png');
}
declare global { interface Window { captionRenderer: { bitmap: typeof renderCaption; scene: typeof renderCaptionScene } } }
