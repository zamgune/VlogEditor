import { z } from 'zod';

export const FontSchema = z.enum(['sans', 'serif', 'maruburi', 'nanumpen']);
export const CAPTION_FONTS = {
  sans: { label: '고딕 · Noto Sans KR', family: 'VlogSans', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  serif: { label: '명조 · Noto Serif KR', family: 'VlogSerif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  maruburi: { label: '마루 부리 · Maru Buri', family: 'VlogMaruBuri', weights: [200, 300, 400, 600, 700] },
  nanumpen: { label: '나눔손글씨 펜', family: 'VlogNanumPen', weights: [400] }
};
export function captionFontWeight(font: z.infer<typeof FontSchema>, weight: number) {
  if (font === 'sans' || font === 'serif') return weight;
  return CAPTION_FONTS[font].weights.reduce((nearest, value) => Math.abs(value - weight) < Math.abs(nearest - weight) ? value : nearest);
}
export const TextStyleSchema = z.object({ font: FontSchema.optional(), size: z.number().min(16).max(200).optional(), weight: z.number().int().min(100).max(900).optional(), color: z.string().regex(/^#[0-9a-f]{6}$/i).optional() }).strict();
export type TextStyle = z.infer<typeof TextStyleSchema>;
export const TextRunSchema = z.object({ start: z.number().int().min(0).max(2000), end: z.number().int().min(1).max(2000), style: TextStyleSchema }).strict();
export type TextRun = z.infer<typeof TextRunSchema>;
export const TextRunsSchema = z.array(TextRunSchema).max(2000).default([]);
export function validTextRuns(text: string, runs: TextRun[]) {
  let end = 0;
  return runs.every(r => { const valid = r.start >= end && r.end > r.start && r.end <= text.length; end = r.end; return valid; });
}
export function textStyleAt(runs: TextRun[], index: number): TextStyle { return runs.find(r => r.start <= index && r.end > index)?.style ?? {}; }
function pack(styles: TextStyle[]): TextRun[] {
  const runs: TextRun[] = [];
  styles.forEach((style, start) => {
    if (!Object.keys(style).length) return;
    const last = runs.at(-1);
    if (last?.end === start && JSON.stringify(last.style) === JSON.stringify(style)) last.end++;
    else runs.push({ start, end: start + 1, style: { ...style } });
  });
  return runs;
}
export function formatTextRange(text: string, runs: TextRun[], start: number, end: number, patch: TextStyle | null) {
  if (start >= end) return runs;
  const graphemes = [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(text)];
  start = graphemes.find(g => g.index <= start && start < g.index + g.segment.length)?.index ?? start;
  const tail = graphemes.find(g => g.index < end && end <= g.index + g.segment.length);
  if (tail) end = tail.index + tail.segment.length;
  return pack(Array.from({ length: text.length }, (_, i) => {
    const style = textStyleAt(runs, i);
    return i >= start && i < end ? patch === null ? {} : { ...style, ...patch } : style;
  }));
}
// Textarea offsets use UTF-16. Preserve unaffected spans through typing, paste and IME replacement.
export function remapTextRuns(before: string, after: string, runs: TextRun[]) {
  if (before === after) return runs;
  let prefix = 0, suffix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  const inserted = after.length - prefix - suffix;
  const inherited = textStyleAt(runs, prefix < before.length - suffix ? prefix : Math.max(0, prefix - 1));
  return pack(Array.from({ length: after.length }, (_, i) => i < prefix ? textStyleAt(runs, i) : i < prefix + inserted ? inherited : textStyleAt(runs, before.length - (after.length - i))));
}
